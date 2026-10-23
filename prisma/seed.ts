import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CATEGORIES } from "../src/lib/constants";
const db = new PrismaClient();
async function main() {
  for (const c of CATEGORIES) {
    await db.category.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name },
      update: { name: c.name },
    });
    for (const name of c.options) {
      const id = c.id + "-" + name.toLowerCase().replaceAll(" ", "-");
      await db.categoryOption.upsert({
        where: { id },
        create: {
          id,
          name,
          categoryId: c.id,
          transactionType: c.id === "furniture" ? "Sale" : name,
          furnitureSubtype: c.id === "furniture" ? name : undefined,
        },
        update: {},
      });
    }
  }
  const existing = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (existing) {
    console.log("Existing admin preserved; seed skipped.");
    return;
  }
  const adminPass =
    process.env.ADMIN_PASSWORD || randomBytes(15).toString("base64url");
  if (adminPass.length < 12)
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  const admin = await db.user.create({
    data: {
      name: process.env.ADMIN_NAME || "Kubera Administrator",
      username: process.env.ADMIN_USERNAME || "admin",
      phone: "+919876500001",
      passwordHash: await hash(adminPass, 12),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });
  const employeePass = randomBytes(15).toString("base64url");
  const employeeHash = await hash(employeePass, 12);
  const employees = await Promise.all(
    ["Rahul Sharma", "Priya Reddy", "Anil Kumar"].map((name, i) =>
      db.user.create({
        data: {
          name,
          username: ["rahul", "priya", "anil"][i],
          phone: "+91987650000" + (i + 2),
          passwordHash: employeeHash,
          mustChangePassword: true,
        },
      }),
    ),
  );
  await fs.mkdir(".local", { recursive: true });
  await fs.writeFile(
    ".local/development-credentials.txt",
    `Kubera Infra — LOCAL DEVELOPMENT ONLY\nAdmin username: ${admin.username}\nAdmin temporary password: ${adminPass}\nEmployee usernames: rahul, priya, anil\nEmployee temporary password: ${employeePass}\nAll accounts must change their password on first login.\n`,
  );
  const root = path.resolve(process.env.STORAGE_PATH || "storage");
  await fs.mkdir(root, { recursive: true });
  const images = {
    flat: "photo-1600585154340-be6161a56a0c",
    house: "photo-1600596542815-ffad4c1539a9",
    plot: "photo-1500382017468-9049fed747ef",
    sofa: "photo-1555041469-a586c61ea9bc",
    dining: "photo-1617806118233-18e1de247200",
    bed: "photo-1505693416388-ac5ce068fe85",
    wardrobe: "photo-1595428774223-ef52624120d2",
    decor: "photo-1600210492486-724fe5c67fb0",
  };
  const imageData = new Map<string, Buffer>();
  for (const [key, value] of Object.entries(images)) {
    const r = await fetch(
      `https://images.unsplash.com/${value}?auto=format&fit=crop&w=1400&q=80`,
    );
    if (!r.ok) throw new Error("Seed photo download failed: " + key);
    imageData.set(
      key,
      await sharp(Buffer.from(await r.arrayBuffer()))
        .webp({ quality: 82 })
        .toBuffer(),
    );
  }
  const titles = [
    "Residential plot in Shadnagar",
    "Corner plot near ORR",
    "2 BHK flat in Gachibowli",
    "3 BHK apartment in Kondapur",
    "Independent house in Miyapur",
    "Family villa in Nallagandla",
    "Three-seater fabric sofa",
    "Solid wood dining set",
    "King-size upholstered bed",
    "Three-door wooden wardrobe",
    "Handcrafted home decor collection",
  ];
  let idx = 0;
  const listingIds: string[] = [];
  for (const c of CATEGORIES)
    for (const opt of c.options) {
      const creator = employees[idx % employees.length];
      const isFurniture = c.id === "furniture";
      const isPlot = c.id === "plots";
      const rent = opt === "Rent";
      const price = isFurniture
        ? [18500, 42000, 35000, 29000, 8500][idx - 6]
        : isPlot
          ? opt === "Lease"
            ? 65000
            : 4200000
          : rent
            ? 25000
            : 8500000;
      const listing = await db.listing.create({
        data: {
          title: titles[idx],
          categoryId: c.id,
          optionId: c.id + "-" + opt.toLowerCase().replaceAll(" ", "-"),
          price,
          negotiable: true,
          state: "Telangana",
          city: "Hyderabad",
          locality: ["Kondapur", "Gachibowli", "Miyapur", "Shadnagar"][idx % 4],
          address: "Survey " + (120 + idx) + ", Main Road",
          pinCode: "500084",
          description: isFurniture
            ? "Well maintained furniture, available for inspection. Contact your assigned employee for dimensions and collection arrangements."
            : "A carefully selected property with good road access and nearby amenities. Schedule a viewing with your assigned employee to explore the location.",
          listedBy: isFurniture ? undefined : "Owner",
          creatorId: creator.id,
          createdAt: new Date(Date.now() - (idx + 2) * 86400000),
          ...(isFurniture
            ? {
                furniture: {
                  create: {
                    brand: "Local artisan",
                    material: "Wood and fabric",
                    condition: "Good",
                    quantity: 1,
                    color: "Natural",
                    dimensions: "Contact for exact measurements",
                  },
                },
              }
            : {
                property: {
                  create: {
                    type: isPlot ? "Residential" : "Apartment",
                    facing: "East",
                    ...(isPlot
                      ? {
                          plotArea: 2400,
                          roadWidth: 40,
                          ...(opt === "Lease"
                            ? {
                                billingPeriod: "Monthly",
                                leaseDuration: "3 years",
                                deposit: 150000,
                              }
                            : {}),
                        }
                      : {
                          bhk: 3,
                          bathrooms: 2,
                          superArea: 1650,
                          carpetArea: 1350,
                          furnishing: "Semi-furnished",
                          parking: 1,
                          totalFloors: 10,
                          floorNo: c.id === "houses" ? 0 : 5,
                          maintenance: 3500,
                          projectName: "Kubera Residency",
                          ...(rent
                            ? { deposit: 75000, tenantType: "Family" }
                            : {
                                constructionStatus: "Ready to Move",
                                propertyAge: 3,
                              }),
                        }),
                  },
                },
              }),
          statusHistory: {
            create: { toStatus: "AVAILABLE", actorId: creator.id },
          },
        },
      });
      listingIds.push(listing.id);
      const imageKey = isFurniture
        ? ["sofa", "dining", "bed", "wardrobe", "decor"][idx - 6]
        : isPlot
          ? "plot"
          : c.id === "houses"
            ? "house"
            : "flat";
      for (let n = 0; n < 2; n++) {
        const key = `seed-${idx}-${n}.webp`;
        await fs.writeFile(
          path.join(root, key),
          imageData.get(
            n === 1 && !isPlot && !isFurniture ? "decor" : imageKey,
          )!,
        );
        await db.photo.create({
          data: {
            key,
            ownerId: creator.id,
            listingId: listing.id,
            position: n,
          },
        });
      }
      idx++;
    }
  for (let i = 0; i < 12; i++) {
    const owner = employees[i % 3];
    const customer = await db.customer.create({
      data: {
        name: [
          "Ramesh Kumar",
          "Pooja Mehta",
          "Amit Choudhary",
          "Sneha Patel",
          "Karthik Reddy",
          "Neha Verma",
          "Suresh Pillai",
          "Anjali Menon",
          "Vikram Sinha",
          "Divya Rao",
          "Arjun Das",
          "Meera Shah",
        ][i],
        phone: "+91990010" + String(i).padStart(4, "0"),
        assignedToId: owner.id,
        source: ["Walk-in", "Phone", "Referral"][i % 3],
        notes:
          "Development sample customer. Replace with real customer records.",
        requirements: {
          create: {
            categoryId: i % 3 === 0 ? "plots" : "flats",
            budgetMin: 2500000,
            budgetMax: 9000000,
            locations: "Kondapur, Gachibowli",
          },
        },
        assignments: { create: { toUserId: owner.id, actorId: admin.id } },
      },
    });
    const listingId = listingIds[i % listingIds.length];
    const when = new Date(Date.now() - (i + 1) * 86400000);
    await db.interaction.create({
      data: {
        requestKey: "seed-enquiry-" + i,
        customerId: customer.id,
        listingId,
        employeeId: owner.id,
        type: "ENQUIRY",
        interest: i === 5 ? "NOT_INTERESTED" : "INTERESTED",
        rejectionReason:
          i === 5 ? "Budget does not match this listing" : undefined,
        occurredAt: when,
        notes: "Initial enquiry recorded by the assigned employee.",
      },
    });
    if (i !== 5) {
      await db.lead.create({
        data: {
          customerId: customer.id,
          listingId,
          generatedById: owner.id,
          stage: [
            "NEW",
            "CONTACTED",
            "VISIT_SCHEDULED",
            "VISITED",
            "NEGOTIATION",
          ][i % 5] as never,
          createdAt: when,
          history: {
            create: { toStage: "NEW", actorId: owner.id, createdAt: when },
          },
        },
      });
    }
    if (i % 2 === 0)
      await db.interaction.create({
        data: {
          requestKey: "seed-view-" + i,
          customerId: customer.id,
          listingId,
          employeeId: owner.id,
          type: "PROPERTY_VIEWING",
          interest: "INTERESTED",
          occurredAt: new Date(when.getTime() + 3600000),
          notes: "Completed an in-person property viewing.",
        },
      });
    await db.followUp.create({
      data: {
        customerId: customer.id,
        listingId,
        employeeId: owner.id,
        dueAt: new Date(Date.now() + (i - 4) * 86400000),
        notes: "Discuss requirements and arrange next steps.",
      },
    });
  }
  console.log(
    "Seeded all categories, sample listings, customers and activity. Credentials saved privately in .local.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
