const express = require('express');
const prisma = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Helper: Generate recurring activity instances
const generateRecurringActivities = (activity) => {
  if (!activity.isRecurring || !activity.recurrence) {
    return [activity];
  }

  const activities = [];
  const startDate = new Date(activity.date);
  const endDate = activity.recurrenceEndDate 
    ? new Date(activity.recurrenceEndDate) 
    : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const instanceDate = new Date(currentDate);
    
    activities.push({
      ...activity,
      date: instanceDate.toISOString(),
      startTime: activity.startTime,
      endTime: activity.endTime,
      id: `${activity.id}_${instanceDate.toISOString().split('T')[0]}`,
    });

    if (activity.recurrence === 'daily') {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (activity.recurrence === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (activity.recurrence === 'monthly') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  return activities;
};

// All routes require auth
router.use(authMiddleware);

// Get all activities for user (with recurring expanded)
router.get('/', async (req, res) => {
  try {
    const dbActivities = await prisma.activity.findMany({
      where: { userId: req.userId },
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
    });

    // Expand recurring activities
    const allActivities = dbActivities.flatMap(generateRecurringActivities);

    res.json(allActivities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activities for specific date
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const dbActivities = await prisma.activity.findMany({
      where: { userId: req.userId },
    });

    // Expand recurring and filter by date
    const allActivities = dbActivities
      .flatMap(generateRecurringActivities)
      .filter(a => a.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    res.json(allActivities);
  } catch (error) {
    console.error('Get activities by date error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activities for date range (NEW - for week view)
router.get('/range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const dbActivities = await prisma.activity.findMany({
      where: { userId: req.userId },
    });

    // Expand recurring and filter by date range
    const allActivities = dbActivities
      .flatMap(generateRecurringActivities)
      .filter(a => a.date >= startDate && a.date <= endDate)
      .sort((a, b) => {
        if (a.date === b.date) {
          return a.startTime.localeCompare(b.startTime);
        }
        return a.date.localeCompare(b.date);
      });

    res.json(allActivities);
  } catch (error) {
    console.error('Get activities by range error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create activity (with recurring support)
router.post('/', async (req, res) => {
  try {
    const { 
      title, 
      type, 
      date,        // ISO datetime string
      startTime,   // ISO datetime string
      endTime,     // ISO datetime string
      isRecurring,
      recurrence,
      recurrenceEndDate  // ISO datetime string
    } = req.body;

    if (!title || !type || !date || !startTime || !endTime) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const activity = await prisma.activity.create({
      data: {
        userId: req.userId,
        title,
        type,
        date: new Date(date),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        isRecurring: isRecurring || false,
        recurrence: recurrence || null,
        recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
      },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update activity
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, date, startTime, endTime, isRecurring, recurrence, recurrenceEndDate } = req.body;

    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = await prisma.activity.update({
      where: { id },
      data: { 
        title, 
        type, 
        date, 
        startTime, 
        endTime,
        isRecurring: isRecurring !== undefined ? isRecurring : existing.isRecurring,
        recurrence: recurrence !== undefined ? recurrence : existing.recurrence,
        recurrenceEndDate: recurrenceEndDate !== undefined ? recurrenceEndDate : existing.recurrenceEndDate,
      },
    });

    res.json(activity);
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete activity
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await prisma.activity.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;