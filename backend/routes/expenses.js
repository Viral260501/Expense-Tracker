const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Expense = require('../models/Expense');

// Create new expense (Employee)
router.post('/', auth, async (req, res) => {
  try {
    const { title, amount, date, notes } = req.body;

    const exp = new Expense({
      title,
      amount,
      date,
      notes,
      createdBy: req.user._id,
      status: 'pending'
    });

    await exp.save();
    res.json(exp);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get expenses (Employee → own, Manager → all)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'manager') {
      const all = await Expense.find().populate('createdBy', 'name email');
      return res.json(all);
    }

    const own = await Expense.find({ createdBy: req.user._id }).populate('createdBy', 'name email');
    res.json(own);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Manager approve/decline expense
router.patch('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ msg: 'Only managers can approve or decline expenses' });
    }

    const { status } = req.body; // approved | declined

    const exp = await Expense.findById(req.params.id);
    if (!exp) return res.status(404).json({ msg: 'Expense not found' });

    exp.status = status;
    await exp.save();

    res.json(exp);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
