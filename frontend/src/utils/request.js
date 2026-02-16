const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export const request = async (path, options = {}) => {
  console.log(`Making ${options.method || 'GET'} request to ${path}`, {
    headers: options.headers,
    bodyLength: options.body?.length,
    hasBody: !!options.body,
  })

  const { headers: optionsHeaders, ...restOptions } = options

  const fetchOptions = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(optionsHeaders || {}),
    },
  }

  console.log('Fetch options:', fetchOptions)

  const response = await fetch(`${API_BASE}${path}`, fetchOptions)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.error || `request_failed (${response.status})`
    if (response.status === 401) {
      throw new Error(`Unauthorized: ${message}`)
    }
    throw new Error(message)
  }

  return response.json()
}
