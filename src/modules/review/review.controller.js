const service = require('./review.service');
const { isBD } = require('../../utils/role.utils');

exports.add = async (req, res) => {
  try {
    const review = await service.addReview(req.body, req.user);
    res.json({
      success: true,
      data: review
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.getByLead = async (req, res) => {
  try {
    const reviews = await service.getReviewsByLead(req.params.leadId, req.user);
    res.json({
      success: true,
      data: reviews
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getReminders = async (req, res) => {
  try {
    const { user_id, week_start_date, status } = req.query;

    if (status && String(status).trim().toUpperCase() !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Only PENDING is supported for reminders'
      });
    }

    const effectiveUserId = isBD(req.user) ? req.user.id : (user_id || req.user.id);
    if (!effectiveUserId) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve user id from token'
      });
    }

    const reminders = await service.getPendingReminders(
      effectiveUserId,
      week_start_date,
      status
    );

    res.json({
      success: true,
      data: reminders
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
