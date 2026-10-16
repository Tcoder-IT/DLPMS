const prisma = require('../config/db');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');

exports.getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { userId: true, email: true, phone: true, role: true, isActive: true, createdAt: true }
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, phone, password, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, phone, passwordHash, role }
    });

    res.status(201).json({ message: 'User created successfully', userId: user.userId });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.verifyAuditLogs = async (req, res) => {
  try {
    const { verifyAuditChain } = require('../services/auditService');
    const report = await verifyAuditChain();
    res.status(200).json(report);
  } catch (error) {
    console.error('Audit verification error:', error);
    res.status(500).json({ error: 'Internal server error during audit chain verification' });
  }
};

exports.triggerBackup = (req, res) => {
  // PostgreSQL dump command
  const command = `pg_dump -U postgres -d dlpms -h localhost -F c -f /tmp/backup-${Date.now()}.dump`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup error: ${error.message}`);
      return res.status(500).json({ error: 'Backup failed' });
    }
    res.status(200).json({ message: 'Backup completed successfully' });
  });
};

exports.getConfig = (req, res) => {
  // Return mocked config
  res.status(200).json({ taxRate: 0.05, registrationFee: 1000 });
};

exports.updateConfig = (req, res) => {
  // Update logic (could save to DB or .env)
  res.status(200).json({ message: 'Config updated successfully' });
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive } = req.body;

    const user = await prisma.user.update({
      where: { userId: id },
      data: { role, isActive }
    });

    res.status(200).json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { userId: id }
    });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete user because they have associated records (e.g. Audit Logs). Please edit the user and suspend their account instead.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
