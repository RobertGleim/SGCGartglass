import { useState } from 'react'
import '../../styles/forms/AddEtsyListingForm.css'

export default function AddEtsyListingForm({ onAddItem }) {
  const [listingValue, setListingValue] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('Linking...')
    
    try {
      await onAddItem(listingValue)
      setListingValue('')
      setStatus('Successfully linked!')
      setTimeout(() => setStatus(''), 3000)
    } catch (error) {
      setStatus(error.message || 'Failed to link listing')
    }
  }

     // Etsy listing form temporarily disabled
     return null;
}
