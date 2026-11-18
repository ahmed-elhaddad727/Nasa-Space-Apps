import './App.css'
import { useState } from 'react'
import MapSelector from './MapSelector'
import CropResults from './CropResults'

function App() {
  const [analysisData, setAnalysisData] = useState(null)
  const [lang, setLang] = useState('en')

  const toggleLang = () => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))

  if (analysisData) {
    return (
      <CropResults
        result={analysisData.result}
        payload={analysisData.payload}
        autoSpeak={analysisData.autoSpeak}
        onBack={() => setAnalysisData(null)}
        lang={lang}
        onToggleLang={toggleLang}
      />
    )
  }

  return (
    <MapSelector
      onComplete={(result, payload, autoSpeak = false) =>
        setAnalysisData({ result, payload, autoSpeak })
      }
      lang={lang}
      onToggleLang={toggleLang}
    />
  )
}

export default App