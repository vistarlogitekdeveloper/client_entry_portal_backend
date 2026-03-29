const isBD = (user) => String(user?.role || '').toUpperCase() === 'BD';
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

module.exports = {
  isBD,
  isAdmin
};
