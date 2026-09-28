import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import * as repository from "./repository.js";
import { normalizeWallpaperImage } from "./services.js";

const detailsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
const user = (request: FastifyRequest) =>
  (
    request as FastifyRequest & {
      currentUser: { id: string; role: string };
    }
  ).currentUser;

export async function registerWallpaperRoutes(server: FastifyInstance, repo = repository) {
  // Keep image reads available to dashboard viewers; all library operations require an operator.
  server.addHook("preHandler", async (request, reply) => {
    if (request.method === "GET" && request.routeOptions.url?.endsWith("/image")) return;
    const role = user(request)?.role;
    if (role !== "ADMINISTRATOR" && role !== "OPERATOR") {
      return reply
        .status(403)
        .send({ message: "Wallpaper Library requires Operator or Administrator access." });
    }
    if (request.routeOptions.url?.endsWith("/default") && role !== "ADMINISTRATOR") {
      return reply
        .status(403)
        .send({ message: "Only an Administrator can change the default wallpaper." });
    }
  });

  server.get("/api/wallpapers", async () => ({ items: await repo.listWallpapers() }));

  async function readUpload(request: FastifyRequest) {
    const uploaded = await request.file();
    if (!uploaded) throw Object.assign(new Error("Select a JPG or PNG file."), { statusCode: 400 });
    const buffer = await uploaded.toBuffer();
    if (!/\.(jpe?g|png)$/i.test(uploaded.filename) || !buffer.length) {
      throw Object.assign(new Error("Select a non-empty JPG or PNG file."), { statusCode: 400 });
    }
    let normalized;
    try {
      normalized = await normalizeWallpaperImage(buffer, uploaded.filename);
    } catch {
      throw Object.assign(
        new Error("This image could not be processed. Choose a valid JPG or PNG."),
        { statusCode: 400 },
      );
    }
    const field = (name: string) => {
      const part = uploaded.fields[name];
      return part && !Array.isArray(part) && part.type === "field" ? part.value : undefined;
    };
    return { normalized, title: field("title"), description: field("description") };
  }

  server.post("/api/wallpapers/preview", async (request, reply) => {
    const { normalized } = await readUpload(request);
    return reply.header("Cache-Control", "no-store").type("image/jpeg").send(normalized.buffer);
  });

  server.post("/api/wallpapers", async (request, reply) => {
    const { normalized, title, description } = await readUpload(request);
    const details = detailsSchema.safeParse({
      title: title ?? normalized.filename.replace(/\.[^.]+$/, ""),
      description: description ?? null,
    });
    if (!details.success)
      return reply.status(400).send({
        message:
          "Title is required (up to 200 characters); description must be at most 2000 characters.",
      });
    const wallpaper = await repo.createWallpaperRecord({
      ...normalized,
      imageData: normalized.buffer,
      ...details.data,
      uploadedById: user(request).id,
    });
    return reply.status(201).send(wallpaper);
  });

  server.get<{ Params: { wallpaperId: string } }>(
    "/api/wallpapers/:wallpaperId",
    async (request, reply) => {
      const wallpaper = (await repo.listWallpapers()).find(
        (item) => item.id === request.params.wallpaperId,
      );
      return wallpaper ?? reply.status(404).send({ message: "Wallpaper not found" });
    },
  );

  server.patch<{ Params: { wallpaperId: string } }>(
    "/api/wallpapers/:wallpaperId",
    async (request, reply) => {
      const details = detailsSchema.safeParse(request.body);
      if (!details.success)
        return reply.status(400).send({
          message:
            "Title is required (up to 200 characters); description must be at most 2000 characters.",
        });
      const result = await repo.updateWallpaperDetails(
        request.params.wallpaperId,
        details.data,
        user(request).id,
      );
      return result ?? reply.status(404).send({ message: "Wallpaper not found" });
    },
  );

  server.put<{ Params: { wallpaperId: string } }>(
    "/api/wallpapers/:wallpaperId/default",
    async (request, reply) => {
      const result = await repo.setDefaultWallpaper(request.params.wallpaperId, user(request).id);
      return result ?? reply.status(404).send({ message: "Wallpaper not found" });
    },
  );

  server.get<{ Params: { wallpaperId: string } }>(
    "/api/wallpapers/:wallpaperId/image",
    async (request, reply) => {
      const wallpaper = await repo.getWallpaperBinary(request.params.wallpaperId);
      if (!wallpaper) return reply.status(404).send({ message: "Wallpaper not found" });
      return reply
        .header("Content-Type", wallpaper.mimeType)
        .header("Content-Length", String(wallpaper.sizeBytes))
        .header("ETag", wallpaper.checksumSha256)
        .header("Cache-Control", "private, max-age=300")
        .send(Buffer.from(wallpaper.imageData));
    },
  );

  server.delete<{ Params: { wallpaperId: string } }>(
    "/api/wallpapers/:wallpaperId",
    async (request, reply) => {
      try {
        await repo.deleteWallpaperRecord({
          wallpaperId: request.params.wallpaperId,
          deletedById: user(request).id,
        });
        return reply.status(204).send();
      } catch (error) {
        return reply
          .status(400)
          .send({ message: error instanceof Error ? error.message : "Wallpaper delete failed" });
      }
    },
  );
}
