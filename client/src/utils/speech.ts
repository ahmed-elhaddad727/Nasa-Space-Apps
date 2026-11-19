import { Lang } from '../i18n';

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function speak(
  text: string,
  lang: Lang,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
  utterance.rate = 0.98;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((v) =>
      lang === 'ar'
        ? v.lang.toLowerCase().startsWith('ar')
        : v.lang.toLowerCase().startsWith('en')
    ) || null;

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
  return true;
}