export function getErrorMessage(error: any): string {
  const code = error?.code || ''
  const message = error?.message || ''

  if (code === '23505') return 'This name already exists. Please use a different name.'
  if (code === '23503') return 'Related record not found. Please refresh and try again.'
  if (code === '42501') return 'Permission denied. Please sign in again.'
  if (message.includes('JWT')) return 'Session expired. Please sign in again.'
  if (message.includes('network')) return 'Network error. Check your connection.'
  if (message.includes('fetch')) return 'Cannot reach server. Check your connection.'
  if (message.includes('duplicate')) return 'This already exists. Please use a different name.'
  if (message.includes('not found')) return 'The requested item was not found.'
  
  return message || 'Something went wrong. Please try again.'
}

export function getAuthErrorMessage(error: any): string {
  const message = error?.message || ''
  
  if (message.includes('Invalid login credentials')) return 'Invalid email or password.'
  if (message.includes('User already registered')) return 'This email is already registered.'
  if (message.includes('Password should be at least')) return 'Password must be at least 6 characters.'
  if (message.includes('Email rate limit')) return 'Too many attempts. Please try again later.'
  
  return getErrorMessage(error)
}

export function getValidationError(field: string, type: string): string {
  const errors: Record<string, Record<string, string>> = {
    email: {
      required: 'Email is required',
      invalid: 'Please enter a valid email address'
    },
    password: {
      required: 'Password is required',
      minLength: 'Password must be at least 6 characters'
    },
    name: {
      required: 'Name is required',
      invalid: 'Please enter a valid name'
    },
    coordinate: {
      invalid: 'Please enter a valid coordinate',
      range: 'Coordinate out of valid range'
    }
  }
  
  return errors[field]?.[type] || 'Invalid input'
}
