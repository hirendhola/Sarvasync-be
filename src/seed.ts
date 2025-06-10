import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Technology' },
      update: {},
      create: {
        name: 'Technology',
        description: 'Articles about technology, programming, and software development'
      }
    }),
    prisma.category.upsert({
      where: { name: 'Lifestyle' },
      update: {},
      create: {
        name: 'Lifestyle',
        description: 'Articles about lifestyle, health, and personal development'
      }
    }),
    prisma.category.upsert({
      where: { name: 'Business' },
      update: {},
      create: {
        name: 'Business',
        description: 'Articles about business, entrepreneurship, and finance'
      }
    })
  ]);

  console.log('✅ Categories seeded:', categories.map(c => c.name).join(', '));

  // Create users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice@example.com' },
      update: {},
      create: {
        email: 'alice@example.com',
        name: 'Alice'
      }
    }),
    prisma.user.upsert({
      where: { email: 'bob@example.com' },
      update: {},
      create: {
        email: 'bob@example.com',
        name: 'Bob'
      }
    }),
    prisma.user.upsert({
      where: { email: 'carol@example.com' },
      update: {},
      create: {
        email: 'carol@example.com',
        name: 'Carol'
      }
    })
  ]);

  console.log('✅ Users seeded:', users.map(u => u.email).join(', '));

  // Create posts
  const posts = await Promise.all([
    prisma.post.upsert({
      where: { id: 'seed-post-1' },
      update: {},
      create: {
        id: 'seed-post-1',
        title: 'Welcome to SarvaSync!',
        content: 'This is the first post in the Technology category.',
        published: true,
        authorId: users[0].id
      }
    }),
    prisma.post.upsert({
      where: { id: 'seed-post-2' },
      update: {},
      create: {
        id: 'seed-post-2',
        title: 'Healthy Living Tips',
        content: 'Lifestyle tips for a healthier you.',
        published: true,
        authorId: users[1].id
      }
    }),
    prisma.post.upsert({
      where: { id: 'seed-post-3' },
      update: {},
      create: {
        id: 'seed-post-3',
        title: 'Starting Your Own Business',
        content: 'A guide to entrepreneurship.',
        published: false,
        authorId: users[2].id
      }
    })
  ]);

  console.log('✅ Posts seeded:', posts.map(p => p.title).join(', '));
}

main()
  .then(() => {
    console.log('🌱 Database seeding completed!');
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    return prisma.$disconnect().then(() => process.exit(1));
  });