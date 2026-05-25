const express = require('express');
const prisma = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Get proposals for a group
router.get('/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const proposals = await prisma.eventProposal.findMany({
      where: { groupId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        votes: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { votes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(proposals);
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create event proposal
router.post('/', async (req, res) => {
  try {
    const { groupId, title, description, date, startTime, endTime, location } =
      req.body;

    if (!groupId || !title || !date || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const proposal = await prisma.eventProposal.create({
      data: {
        groupId,
        creatorId: req.userId,
        title,
        description,
        date: new Date(date),          // Convert to DateTime
        startTime: new Date(startTime), // Convert to DateTime
        endTime: new Date(endTime),     // Convert to DateTime
        location,
        status: 'proposed',
        votes: {
          create: {
            userId: req.userId,
            response: 'yes',
          },
        },
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        votes: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update finalize to create proper DateTime activities
router.post('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;

    const proposal = await prisma.eventProposal.findUnique({
      where: { id },
      include: {
        votes: true,
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.creatorId !== req.userId) {
      return res.status(403).json({ error: 'Only proposal creator can finalize' });
    }

    if (proposal.status !== 'proposed') {
      return res.status(400).json({ error: 'Proposal already finalized' });
    }

    const yesVoters = proposal.votes
      .filter((v) => v.response === 'yes')
      .map((v) => v.userId);

    const attendees = new Set([proposal.creatorId, ...yesVoters]);
    const attendeesArray = Array.from(attendees);

    await prisma.eventProposal.update({
      where: { id },
      data: { status: 'finalized' },
    });

    const activities = [];
    for (const userId of attendeesArray) {
      const activity = await prisma.activity.create({
        data: {
          userId,
          title: proposal.title,
          type: 'other',
          date: proposal.date,        // Already DateTime
          startTime: proposal.startTime, // Already DateTime
          endTime: proposal.endTime,     // Already DateTime
          eventProposalId: id,
        },
      });
      activities.push(activity);
    }

    res.json({
      proposal: { ...proposal, status: 'finalized' },
      activitiesCreated: activities.length,
      activities: activities,
    });
  } catch (error) {
    console.error('Finalize proposal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vote on proposal
router.post('/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body; // 'yes', 'no', 'maybe'

    if (!['yes', 'no', 'maybe'].includes(response)) {
      return res.status(400).json({ error: 'Invalid vote response' });
    }

    const proposal = await prisma.eventProposal.findUnique({
      where: { id },
      include: { group: true },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: proposal.groupId,
          userId: req.userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    if (proposal.status !== 'proposed') {
      return res
        .status(400)
        .json({ error: 'Can only vote on proposed events' });
    }

    // Upsert vote
    const vote = await prisma.vote.upsert({
      where: {
        eventProposalId_userId: {
          eventProposalId: id,
          userId: req.userId,
        },
      },
      update: {
        response,
      },
      create: {
        eventProposalId: id,
        userId: req.userId,
        response,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json(vote);
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel proposal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const proposal = await prisma.eventProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Only creator can cancel
    if (proposal.creatorId !== req.userId) {
      return res
        .status(403)
        .json({ error: 'Only proposal creator can cancel' });
    }

    await prisma.eventProposal.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Cancel proposal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;