import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import { registerWallpaperRoutes } from "../src/wallpaper-routes.js";
import { normalizeWallpaperImage } from "../src/services.js";

const image = await sharp({
  create: { width: 800, height: 1000, channels: 3, background: "#2468ac" },
})
  .png()
  .toBuffer();
function multipartBody(file = image, name = "portrait.png", title = "Review wallpaper") {
  const boundary = "cwcm-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
async function app(role: string, fileSize = 64 * 1024 * 1024) {
  const calls: string[] = [];
  let saved: Buffer | undefined;
  const repo = {
    listWallpapers: async () => [],
    createWallpaperRecord: async (payload: { imageData: Buffer; title: string }) => {
      calls.push("create");
      saved = payload.imageData;
      return { id: "saved", title: payload.title };
    },
    setDefaultWallpaper: async (id: string) => {
      calls.push("default");
      return id === "missing" ? null : { defaultWallpaperId: id };
    },
    updateWallpaperDetails: async (_id: string, details: object) => {
      calls.push("edit");
      return details;
    },
    deleteWallpaperRecord: async () => {
      calls.push("delete");
      throw new Error("Wallpaper is used by a draft campaign");
    },
  };
  const server = Fastify();
  server.addHook("preHandler", async (request) =>
    Object.assign(request, { currentUser: { id: "test-actor", role } }),
  );
  await server.register(multipart, { limits: { fileSize } });
  await server.register(async (scope) =>
    registerWallpaperRoutes(
      scope,
      repo as unknown as Parameters<typeof registerWallpaperRoutes>[1],
    ),
  );
  return { server, calls, saved: () => saved };
}

test("Operator cannot set default; Viewer cannot mutate/read library", async () => {
  for (const role of ["OPERATOR", "VIEWER"]) {
    const { server, calls } = await app(role);
    try {
      assert.equal(
        (await server.inject({ method: "PUT", url: "/api/wallpapers/one/default", payload: {} }))
          .statusCode,
        403,
      );
      if (role === "VIEWER") {
        for (const [method, url] of [
          ["GET", "/api/wallpapers"],
          ["POST", "/api/wallpapers/preview"],
          ["POST", "/api/wallpapers"],
          ["PATCH", "/api/wallpapers/one"],
          ["DELETE", "/api/wallpapers/one"],
        ] as const) {
          assert.equal((await server.inject({ method, url })).statusCode, 403);
        }
      }
      assert.deepEqual(calls, []);
    } finally {
      await server.close();
    }
  }
});
test("Administrator sets default, missing wallpaper returns 404", async () => {
  const { server } = await app("ADMINISTRATOR");
  try {
    assert.deepEqual(
      (
        await server.inject({ method: "PUT", url: "/api/wallpapers/one/default", payload: {} })
      ).json(),
      { defaultWallpaperId: "one" },
    );
    assert.equal(
      (await server.inject({ method: "PUT", url: "/api/wallpapers/missing/default", payload: {} }))
        .statusCode,
      404,
    );
  } finally {
    await server.close();
  }
});
test("Preview has no persistence; saved bytes match preview with submitted title", async () => {
  const { server, calls, saved } = await app("OPERATOR");
  try {
    const preview = await server.inject({
      method: "POST",
      url: "/api/wallpapers/preview",
      ...multipartBody(),
    });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.headers["cache-control"], "no-store");
    assert.deepEqual(calls, []);
    const metadata = await sharp(preview.rawPayload).metadata();
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1080);
    const result = await server.inject({
      method: "POST",
      url: "/api/wallpapers",
      ...multipartBody(),
    });
    assert.equal(result.statusCode, 201);
    assert.equal(result.json().title, "Review wallpaper");
    assert.deepEqual(saved(), preview.rawPayload);
    const expected = await normalizeWallpaperImage(image, "portrait.png");
    assert.deepEqual(expected.buffer, saved());
  } finally {
    await server.close();
  }
});
test("Corrupt images and blank titles are rejected without persistence; metadata is bounded", async () => {
  const { server, calls } = await app("OPERATOR");
  try {
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/wallpapers/preview",
          ...multipartBody(Buffer.from("broken")),
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/wallpapers",
          ...multipartBody(image, "x.png", "   "),
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await server.inject({
          method: "PATCH",
          url: "/api/wallpapers/one",
          payload: { title: "x", description: "a".repeat(2001) },
        })
      ).statusCode,
      400,
    );
    assert.deepEqual(calls, []);
    assert.equal(
      (
        await server.inject({
          method: "PATCH",
          url: "/api/wallpapers/one",
          payload: { title: "Updated", description: "Note" },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await server.inject({ method: "DELETE", url: "/api/wallpapers/one" })).statusCode,
      400,
    );
  } finally {
    await server.close();
  }
});

test("Oversized files are rejected by multipart before persistence", async () => {
  const { server, calls } = await app("OPERATOR", 256);
  try {
    const result = await server.inject({
      method: "POST",
      url: "/api/wallpapers/preview",
      ...multipartBody(),
    });
    assert.equal(result.statusCode, 413);
    assert.deepEqual(calls, []);
  } finally {
    await server.close();
  }
});
test("A renamed SVG cannot bypass the JPG/PNG restriction", async () => {
  const { server, calls } = await app("OPERATOR");
  try {
    const result = await server.inject({
      method: "POST",
      url: "/api/wallpapers/preview",
      ...multipartBody(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
        "fake.png",
      ),
    });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(calls, []);
  } finally {
    await server.close();
  }
});

test("Default selection changes only the fallback key and records the actor", async (t) => {
  const { prisma } = await import("../src/prisma.js");
  const { setDefaultWallpaper } = await import("../src/repository.js");
  const writes: unknown[] = [];
  const tx = {
    wallpaper: { findFirst: async () => ({ id: "one", title: "Selected image" }) },
    systemSetting: { upsert: async (args: unknown) => writes.push(args) },
    activityLog: { create: async (args: unknown) => writes.push(args) },
  };
  const original = prisma.$transaction;
  Object.assign(prisma, {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  });
  t.after(() => {
    Object.assign(prisma, { $transaction: original });
  });
  assert.deepEqual(await setDefaultWallpaper("one", "admin-id"), { defaultWallpaperId: "one" });
  assert.deepEqual(writes, [
    {
      where: { key: "defaultWallpaperId" },
      create: { key: "defaultWallpaperId", valueJson: '"one"', updatedById: "admin-id" },
      update: { valueJson: '"one"', updatedById: "admin-id" },
    },
    { data: { actor: "admin-id", action: "wallpaper.default_changed", detail: "Selected image" } },
  ]);
});

test("Deletion rechecks default and draft/active/scheduled references before any write", async (t) => {
  const { prisma } = await import("../src/prisma.js");
  const { deleteWallpaperRecord } = await import("../src/repository.js");
  let referenced = false;
  let isDefault = true;
  let writes = 0;
  const tx = {
    wallpaper: {
      findFirst: async () => ({
        id: "one",
        filename: "one.jpg",
        campaigns: referenced ? [{ status: "DRAFT" }] : [],
      }),
      update: async () => {
        writes++;
      },
    },
    systemSetting: {
      findUnique: async () => ({ valueJson: JSON.stringify(isDefault ? "one" : null) }),
    },
    activityLog: {
      create: async () => {
        writes++;
      },
    },
  };
  const original = prisma.$transaction;
  Object.assign(prisma, {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  });
  t.after(() => {
    Object.assign(prisma, { $transaction: original });
  });
  await assert.rejects(
    deleteWallpaperRecord({ wallpaperId: "one", deletedById: "actor" }),
    /default wallpaper/,
  );
  isDefault = false;
  referenced = true;
  await assert.rejects(
    deleteWallpaperRecord({ wallpaperId: "one", deletedById: "actor" }),
    /draft, scheduled, or active/,
  );
  assert.equal(writes, 0);
  referenced = false;
  await deleteWallpaperRecord({ wallpaperId: "one", deletedById: "actor" });
  assert.equal(writes, 2);
});

test("Campaign creation rejects a wallpaper deleted since the Library was loaded", async (t) => {
  const { prisma } = await import("../src/prisma.js");
  const { createCampaignRecord } = await import("../src/repository.js");
  const original = prisma.wallpaper.findUnique;
  Object.assign(prisma.wallpaper, {
    findUnique: async () => ({ id: "removed", deletedAt: new Date() }),
  });
  t.after(() => {
    Object.assign(prisma.wallpaper, { findUnique: original });
  });
  await assert.rejects(
    createCampaignRecord({
      name: "New campaign",
      wallpaperId: "removed",
      priority: 5,
      createdById: "actor",
    }),
    /Wallpaper not found/,
  );
});
