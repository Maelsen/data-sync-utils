import "dotenv/config";
import { generateInvoice } from "./lib/invoice";
import { prisma } from "./lib/prisma";

(async()=>{
  const hotels = await prisma.hotel.findMany();
  console.log(hotels);
  const res = await generateInvoice(hotels[0].id, 2025, 11);
  console.log(res);
  await prisma.$disconnect();
})();
