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

  return (
    <div className="panel-section">
      <h3>Add Etsy Listing</h3>
      <form className="inline-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={listingValue}
          onChange={(event) => setListingValue(event.target.value)}
          placeholder="Paste Etsy listing URL or ID"
          required
        />
        <button className="button primary" type="submit">
          Link listing
        </button>
      </form>
      {status && <p className="status-text">{status}</p>}
    </div>
  )
}
