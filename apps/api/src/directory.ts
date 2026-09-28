import fs from "node:fs";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { Client, InvalidCredentialsError } from "ldapts";
import { appConfig } from "./config.js";

export class DirectoryUnavailable extends Error {
  constructor() {
    super("Active Directory is unavailable. Please try again later or contact an administrator.");
  }
}
export class InvalidLogin extends Error {
  constructor() {
    super("Invalid username or password, or access has not been assigned.");
  }
}
export function escapeLdapFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}
export interface DirectoryConfig {
  LDAP_URL?: string;
  LDAP_BIND_DN?: string;
  LDAP_BIND_PASSWORD?: string;
  LDAP_BASE_DN?: string;
  LDAP_CA_FILE?: string;
  LDAP_TLS_REJECT_UNAUTHORIZED?: boolean;
  LDAP_TIMEOUT_MS: number;
}
export function createDirectory(
  config: DirectoryConfig,
  factory = (options: ConstructorParameters<typeof Client>[0]) => new Client(options),
) {
  function client() {
    if (
      !config.LDAP_URL ||
      !config.LDAP_BIND_DN ||
      !config.LDAP_BIND_PASSWORD ||
      !config.LDAP_BASE_DN
    )
      throw new DirectoryUnavailable();
    let url: URL;
    try {
      url = new URL(config.LDAP_URL);
    } catch {
      throw new DirectoryUnavailable();
    }
    if (!["ldaps:", "ldap:"].includes(url.protocol) || url.username || url.password)
      throw new DirectoryUnavailable();
    try {
      const tlsOptions = {
        minVersion: "TLSv1.2" as const,
        rejectUnauthorized: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false,
        ...(isIP(url.hostname) ? {} : { servername: url.hostname }),
        checkServerIdentity: (_host: string, cert: Parameters<typeof checkServerIdentity>[1]) =>
          checkServerIdentity(url.hostname, cert),
        ...(config.LDAP_CA_FILE ? { ca: fs.readFileSync(config.LDAP_CA_FILE) } : {}),
      };
      return {
        connection: factory({
          url: config.LDAP_URL,
          timeout: config.LDAP_TIMEOUT_MS,
          connectTimeout: config.LDAP_TIMEOUT_MS,
          tlsOptions,
          strictDN: false,
        }),
        tlsOptions,
        startTls: url.protocol === "ldap:",
      };
    } catch {
      throw new DirectoryUnavailable();
    }
  }
  async function lookup(username: string) {
    if (!username.trim() || username.includes("\\")) throw new InvalidLogin();
    const { connection, tlsOptions, startTls } = client();
    try {
      if (startTls) await connection.startTLS(tlsOptions);
      await connection.bind(config.LDAP_BIND_DN!, config.LDAP_BIND_PASSWORD!);
      const attribute = username.includes("@") ? "userPrincipalName" : "sAMAccountName";
      const { searchEntries } = await connection.search(config.LDAP_BASE_DN!, {
        scope: "sub",
        sizeLimit: 2,
        timeLimit: Math.ceil(config.LDAP_TIMEOUT_MS / 1000),
        filter: `(&(objectCategory=person)(objectClass=user)(${attribute}=${escapeLdapFilter(username.trim())})(!(userAccountControl:1.2.840.113556.1.4.803:=2)))`,
        attributes: ["objectGUID"],
        explicitBufferAttributes: ["objectGUID"],
      });
      if (searchEntries.length !== 1) throw new InvalidLogin();
      const entry = searchEntries[0];
      const guid = entry.objectGUID;
      if (!Buffer.isBuffer(guid) || guid.length !== 16) throw new DirectoryUnavailable();
      return { dn: entry.dn, objectId: guid.toString("base64") };
    } catch (error) {
      if (error instanceof InvalidLogin || error instanceof DirectoryUnavailable) throw error;
      throw new DirectoryUnavailable();
    } finally {
      await connection.unbind().catch(() => undefined);
    }
  }
  async function authenticate(username: string, password: string, expectedObjectId: string) {
    // Empty passwords can cause an unauthenticated LDAP bind; reject before connecting.
    if (!password || !expectedObjectId) throw new InvalidLogin();
    const identity = await lookup(username);
    if (identity.objectId !== expectedObjectId) throw new InvalidLogin();
    const { connection, tlsOptions, startTls } = client();
    try {
      if (startTls) await connection.startTLS(tlsOptions);
      await connection.bind(identity.dn, password);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw new InvalidLogin();
      throw new DirectoryUnavailable();
    } finally {
      await connection.unbind().catch(() => undefined);
    }
  }
  return { lookup, authenticate };
}
export const directory = createDirectory(appConfig);
