/**
 * VDA Service Configuration Validator
 *
 * Validates VDA_SERVICE_URL and related configuration at server startup
 * to prevent runtime issues and security risks from misconfiguration.
 */

/**
 * Validates VDA service configuration at startup
 * Exits process if critical configuration errors are found
 */
export function validateVdaServiceConfig() {
  const vdaUrl = process.env.VDA_SERVICE_URL?.trim();
  const apiKey = process.env.VDA_SERVICE_API_KEY?.trim();
  const nodeEnv = process.env.NODE_ENV || 'development';

  // If VDA_SERVICE_URL is not set, VDA feature is disabled - this is OK
  if (!vdaUrl) {
    console.log('ℹ️  VDA service disabled (VDA_SERVICE_URL not configured)');
    return;
  }

  console.log('🔍 Validating VDA service configuration...');

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(vdaUrl);
  } catch (err) {
    console.error('❌ VDA_SERVICE_URL is not a valid URL:', vdaUrl);
    console.error('   Error:', err.message);
    process.exit(1);
  }

  // Validate protocol
  const protocol = parsedUrl.protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    console.error('❌ VDA_SERVICE_URL must use HTTP or HTTPS protocol');
    console.error('   Got:', protocol);
    process.exit(1);
  }

  // Require HTTPS in production
  if (nodeEnv === 'production' && protocol === 'http:') {
    console.error('❌ VDA_SERVICE_URL must use HTTPS in production');
    console.error('   Current URL:', vdaUrl);
    console.error('   Using HTTP in production could expose API tokens to interception');
    process.exit(1);
  }

  // Warn about HTTP in non-production
  if (nodeEnv !== 'production' && protocol === 'http:') {
    console.warn('⚠️  VDA_SERVICE_URL uses HTTP (not HTTPS)');
    console.warn('   This is acceptable in development but must be HTTPS in production');
  }

  // Require API key when VDA URL is configured
  if (!apiKey) {
    console.error('❌ VDA_SERVICE_API_KEY is required when VDA_SERVICE_URL is configured');
    console.error('   VDA service authentication would fail without API key');
    process.exit(1);
  }

  // Validate API key format (basic check)
  if (apiKey.length < 10) {
    console.error('❌ VDA_SERVICE_API_KEY appears to be too short (minimum 10 characters)');
    console.error('   Please verify the API key is correct');
    process.exit(1);
  }

  // Check for common mistakes
  if (vdaUrl.includes('localhost') && nodeEnv === 'production') {
    console.error('❌ VDA_SERVICE_URL points to localhost in production');
    console.error('   This will not work in a deployed environment');
    process.exit(1);
  }

  if (vdaUrl.includes('example.com') || vdaUrl.includes('placeholder')) {
    console.error('❌ VDA_SERVICE_URL appears to be a placeholder value');
    console.error('   Please set a real service URL');
    process.exit(1);
  }

  // Validate URL structure
  if (!parsedUrl.hostname) {
    console.error('❌ VDA_SERVICE_URL is missing hostname');
    process.exit(1);
  }

  // Success
  console.log('✅ VDA service configuration validated:');
  console.log('   URL:', vdaUrl);
  console.log('   Protocol:', protocol);
  console.log('   Environment:', nodeEnv);
}

/**
 * Validates VDA_REQUIRE_AUTH configuration
 * Note: This is for Node.js backend, Python service has its own validation
 */
export function validateVdaAuthConfig() {
  const requireAuth = process.env.VDA_REQUIRE_AUTH?.trim().toLowerCase();

  // If not set, default is true (secure by default)
  if (!requireAuth) {
    return;
  }

  // Known valid values
  const validTrueValues = ['true', 'yes', '1', 'on'];
  const validFalseValues = ['false', 'no', '0', 'off'];
  const allValidValues = [...validTrueValues, ...validFalseValues];

  if (!allValidValues.includes(requireAuth)) {
    console.error('❌ Invalid VDA_REQUIRE_AUTH value:', requireAuth);
    console.error('   Valid values:', allValidValues.join(', '));
    console.error('   Typos in this setting could accidentally disable authentication');
    process.exit(1);
  }

  // Warn if auth is disabled
  if (validFalseValues.includes(requireAuth)) {
    console.warn('⚠️  VDA_REQUIRE_AUTH is set to false');
    console.warn('   Authentication checks are disabled for VDA service');
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Disabling authentication in production is not recommended');
      process.exit(1);
    }
  }
}

export default { validateVdaServiceConfig, validateVdaAuthConfig };
