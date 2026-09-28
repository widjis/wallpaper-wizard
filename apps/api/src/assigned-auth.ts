import bcrypt from "bcryptjs";
import { directory, InvalidLogin } from "./directory.js";

export interface AssignedAccount {
  username: string;
  authSource: string;
  adObjectId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  passwordHash: string;
}
export async function verifyAssignedCredentials(
  user: AssignedAccount | null,
  password: string,
  dependencies = { authenticate: directory.authenticate, compare: bcrypt.compare },
) {
  if (!user || !user.isActive || user.deletedAt || !password) throw new InvalidLogin();
  if (user.authSource === "AD") {
    if (!user.adObjectId) throw new InvalidLogin();
    await dependencies.authenticate(user.username, password, user.adObjectId);
  } else if (
    user.authSource !== "LOCAL" ||
    !(await dependencies.compare(password, user.passwordHash))
  ) {
    throw new InvalidLogin();
  }
}
