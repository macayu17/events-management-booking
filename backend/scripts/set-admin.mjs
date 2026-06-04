import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetEmail = process.env.ADMIN_EMAIL;
  const confirmedEmail = process.env.CONFIRM_ADMIN_EMAIL;

  if (!targetEmail) {
    console.log('Set ADMIN_EMAIL and CONFIRM_ADMIN_EMAIL to the same address to promote a user to ADMIN.');
    return;
  }

  if (confirmedEmail !== targetEmail) {
    console.log('Refusing to update role. CONFIRM_ADMIN_EMAIL must exactly match ADMIN_EMAIL.');
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { email: true, role: true }
  });

  if (!targetUser) {
    console.log(`\nUser ${targetEmail} not found.`);
    return;
  }

  if (targetUser.role === 'ADMIN') {
    console.log(`\nUser ${targetEmail} is already ADMIN.`);
    return;
  }

  await prisma.user.update({
    where: { email: targetEmail },
    data: { role: 'ADMIN' }
  });
  console.log(`\nUpdated ${targetEmail} to ADMIN role.`);
}

main()
  .catch((error) => {
    console.error('Set-admin failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
