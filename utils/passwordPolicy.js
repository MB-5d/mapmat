const MIN_PASSWORD_LENGTH = 8;

function getPasswordMinLengthError(label = 'Password') {
  return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  getPasswordMinLengthError,
};
