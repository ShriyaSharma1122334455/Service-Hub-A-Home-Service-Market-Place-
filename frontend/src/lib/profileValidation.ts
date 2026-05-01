export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export type FormErrors = Partial<Record<'full_name' | 'phone' | 'bio', string>>;

export type EditProfileFormData = {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
};

const FULL_NAME_RE = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const PHONE_RE = /^(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

export function validateFullName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    return { valid: false, error: 'Full name must be 2-100 characters' };
  }
  if (!FULL_NAME_RE.test(trimmed)) {
    return { valid: false, error: 'Full name may only contain letters, spaces, hyphens, or apostrophes' };
  }
  return { valid: true };
}

export function validatePhoneNumber(phone: string): ValidationResult {
  if (!phone.trim()) return { valid: true };
  if (!PHONE_RE.test(phone.trim())) {
    return { valid: false, error: 'Phone must be in format (XXX) XXX-XXXX or +1-XXX-XXX-XXXX' };
  }
  return { valid: true };
}

export function validateBio(bio: string): ValidationResult {
  if (bio.trim().length > 500) {
    return { valid: false, error: 'Bio must not exceed 500 characters' };
  }
  return { valid: true };
}

export function validateEditProfileForm(formData: EditProfileFormData): {
  isValid: boolean;
  errors: FormErrors;
} {
  const errors: FormErrors = {};

  const nameResult = validateFullName(formData.full_name);
  if (!nameResult.valid) errors.full_name = nameResult.error;

  const phoneResult = validatePhoneNumber(formData.phone);
  if (!phoneResult.valid) errors.phone = phoneResult.error;

  const bioResult = validateBio(formData.bio);
  if (!bioResult.valid) errors.bio = bioResult.error;

  return { isValid: Object.keys(errors).length === 0, errors };
}
