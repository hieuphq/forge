import { Prisma, PrismaClient, type ExpenseCategory, type UserRole } from "@prisma/client";

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

const projects = [
  { name: "Kitchen remodel", estimate: new Prisma.Decimal("12000.00"), status: "active" as const },
  { name: "Bathroom refresh", estimate: new Prisma.Decimal("6500.00"), status: "active" as const },
  { name: "Deck repair", estimate: new Prisma.Decimal("4200.00"), status: "active" as const },
];

function lineAmount(quantity: string, unitPrice: string) {
  return new Prisma.Decimal(quantity).mul(unitPrice);
}

function expenseTotals(items: { quantity: string; unitPrice: string }[], tax: string, fee: string) {
  const subtotal = items.reduce((sum, item) => sum.add(lineAmount(item.quantity, item.unitPrice)), new Prisma.Decimal(0));
  return { subtotal, totalAmount: subtotal.add(tax).add(fee) };
}

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

async function upsertProject(project: (typeof projects)[number]) {
  const existing = await prisma.project.findFirst({ where: { name: project.name } });
  if (existing) {
    return prisma.project.update({ where: { id: existing.id }, data: project });
  }
  return prisma.project.create({ data: project });
}

async function createExpense(input: {
  projectId: string;
  createdById: string;
  vendor: string;
  category: ExpenseCategory;
  entryDate: string;
  note?: string;
  tax: string;
  fee: string;
  items: { description: string; quantity: string; unitPrice: string }[];
}) {
  const totals = expenseTotals(input.items, input.tax, input.fee);
  return prisma.expense.create({
    data: {
      projectId: input.projectId,
      createdById: input.createdById,
      vendor: input.vendor,
      category: input.category,
      entryDate: new Date(input.entryDate),
      note: input.note,
      tax: input.tax,
      fee: input.fee,
      subtotal: totals.subtotal,
      totalAmount: totals.totalAmount,
      items: {
        create: input.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: lineAmount(item.quantity, item.unitPrice),
        })),
      },
    },
  });
}

async function main() {
  const [owner, pm] = await Promise.all(users.map(upsertSeedUser));
  const seededProjects = await Promise.all(projects.map(upsertProject));
  const projectIds = seededProjects.map((project) => project.id);

  await prisma.attachment.deleteMany({ where: { expense: { projectId: { in: projectIds } } } });
  await prisma.expense.deleteMany({ where: { projectId: { in: projectIds } } });

  await createExpense({
    projectId: seededProjects[0].id,
    createdById: pm.id,
    vendor: "Home Depot",
    category: "material",
    entryDate: "2026-09-01",
    note: "Cabinet lumber and fasteners",
    tax: "142.35",
    fee: "0.00",
    items: [
      { description: "Plywood sheets", quantity: "18", unitPrice: "42.50" },
      { description: "Cabinet hardware", quantity: "1", unitPrice: "520.00" },
    ],
  });

  await createExpense({
    projectId: seededProjects[0].id,
    createdById: owner.id,
    vendor: "City Electric",
    category: "labor",
    entryDate: "2026-09-03",
    note: "Rough-in electrical labor",
    tax: "0.00",
    fee: "35.00",
    items: [{ description: "Electrician crew", quantity: "16", unitPrice: "95.00" }],
  });

  await createExpense({
    projectId: seededProjects[1].id,
    createdById: pm.id,
    vendor: "Tile Supply Co",
    category: "material",
    entryDate: "2026-09-02",
    tax: "86.10",
    fee: "25.00",
    items: [{ description: "Porcelain tile", quantity: "140", unitPrice: "6.15" }],
  });

  await createExpense({
    projectId: seededProjects[2].id,
    createdById: pm.id,
    vendor: "Tool Rental",
    category: "equipment",
    entryDate: "2026-09-04",
    tax: "18.40",
    fee: "12.00",
    items: [{ description: "Post-hole auger rental", quantity: "2", unitPrice: "115.00" }],
  });

  console.log("Seed complete");
  console.log(`Login users: owner@example.test / pm@example.test / worker@example.test`);
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
