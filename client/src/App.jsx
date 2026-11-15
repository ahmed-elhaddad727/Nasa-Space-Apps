import { useState } from 'react'
import MapSelector from './MapSelector'
import CropResults from './CropResults'

function App() {
  const [analysisData, setAnalysisData] = useState(null)

  if (analysisData) {
    return (
      <CropResults
        result={analysisData.result}
        payload={analysisData.payload}
        onBack={() => setAnalysisData(null)}
      />
    )
  }

  return (
    <MapSelector
      onComplete={(result, payload) => setAnalysisData({ result, payload })}
    />
  )
}

export default App