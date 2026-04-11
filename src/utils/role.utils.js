const isBD = (user) => String(user?.role || '').toUpperCase() === 'BD';
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const isHeadOffice = (user) => String(user?.role || '').toUpperCase() === 'HEAD OFFICE';

module.exports = {
  isBD,
  isAdmin,
  isHeadOffice
};
