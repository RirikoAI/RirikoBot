const express = require('express');
const router = express.Router();

// Sample data for demonstration
const users = [
  { id: 1, name: 'John Doe' },
  { id: 2, name: 'Jane Smith' },
];

// Define API routes
router.get('/users', (req, res) => {
  res.json(users);
});

router.post('/users', (req, res) => {
  const { name } = req.body;
  const newUser = { id: users.length + 1, name };
  users.push(newUser);
  res.status(201).json(newUser);
});

module.exports = router;
