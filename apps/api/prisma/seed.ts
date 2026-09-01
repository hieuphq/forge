import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const seedPassword = process.env.SEED_PASSWORD ?? "password123";

type SeedUser = {
  email: string;
  username: string;
  name: string;
  role: UserRole;
};

const users: SeedUser[] = [
  { email: "owner@example.test", username: "owner", name: "Olivia Owner", role: "owner" },
  { email: "pm@example.test", username: "pm", name: "Pat Project", role: "pm" },
  { email: "worker@example.test", username: "worker", name: "Wes Worker", role: "worker" },
];

async function upsertSeedUser(user: SeedUser) {
  const passwordHash = await Bun.password.hash(seedPassword, { algorithm: "argon2id" });
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: user.email }, { username: user.username }] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { email: user.email, username: user.username, name: user.name, role: user.role, passwordHash },
    });
  }
  return prisma.user.create({ data: { ...user, passwordHash } });
}

async function main() {
  await Promise.all(users.map(upsertSeedUser));
  console.log("Seed complete");
  console.log("Login users: owner@example.test / pm@example.test / worker@example.test");
  console.log(`Password: ${seedPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
