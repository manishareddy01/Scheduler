const express = require('express');
const prisma = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Get all groups user is in
router.get('/', async (req, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      include: {
        group: {
          include: {
            creator: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: { members: true, eventProposals: true },
            },
          },
        },
      },
    });

    const groups = memberships.map((m) => ({
      ...m.group,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single group details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        eventProposals: {
          include: {
            creator: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: { votes: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name required' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        description,
        creatorId: req.userId,
        members: {
          create: {
            userId: req.userId,
            role: 'admin',
          },
        },
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Invite user to group (by email)
router.post('/:id/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    // Check if requester is admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.userId,
        },
      },
    });

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    // Find user by email
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already member
    const existing = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: invitedUser.id,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add to group
    const newMember = await prisma.groupMember.create({
      data: {
        groupId: id,
        userId: invitedUser.id,
        role: 'member',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(newMember);
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave group
router.delete('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.userId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    // Don't allow creator to leave if they're the only admin
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: true,
      },
    });

    if (group.creatorId === req.userId) {
      const adminCount = group.members.filter((m) => m.role === 'admin').length;
      if (adminCount === 1) {
        return res
          .status(400)
          .json({ error: 'Transfer admin role before leaving' });
      }
    }

    await prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId: id,
          userId: req.userId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;