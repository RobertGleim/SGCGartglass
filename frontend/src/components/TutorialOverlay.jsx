import React, { useState, useEffect } from 'react';
import styles from './TutorialOverlay.module.css';

const STEPS = [
  {
    title: 'Welcome',
    desc: 'Welcome to the Stained Glass Designer! Let’s walk through the basics.',
    selector: null,
  },
  {
    title: 'Select Template',
    desc: 'Choose a template from the gallery to start your design.',
    selector: '#template-gallery',
  },
  {
    title: 'Color Regions',
    desc: 'Click regions on the canvas to fill with color and glass type.',
    selector: '#canvas-workspace',
  },
  {
    title: 'Glass Types',
    desc: 'Select glass types for each region using the glass type selector.',
    selector: '#glass-type-selector',
  },
  {
    title: 'Save/Submit',
    desc: 'Save your project or submit a work order when finished.',
    selector: '#save-submit-btn',
  },
];

export default function TutorialOverlay({ onClose }) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('tutorialComplete')) {
      setTimeout(() => setShow(true), 0);
    }
  }, []);

  useEffect(() => {
    if (show && STEPS[step]?.selector) {
      const el = document.querySelector(STEPS[step].selector);
      if (el) el.classList.add(styles.spotlight);
      return () => { if (el) el.classList.remove(styles.spotlight); };
    }
  }, [step, show]);

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      localStorage.setItem('tutorialComplete', 'true');
      setShow(false);
      onClose && onClose();
    }
  };
  const handleSkip = () => {
    localStorage.setItem('tutorialComplete', 'true');
    setShow(false);
    onClose && onClose();
  };
  const handleDontShow = () => {
    localStorage.setItem('tutorialComplete', 'true');
    setShow(false);
    onClose && onClose();
  };

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Enter') handleNext();
      if (e.key === 'Escape') handleSkip();
    }
    if (show) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [show, step, handleNext, handleSkip]);

  if (!show) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.tutorialBox}>
        <div className={styles.progress}>Step {step + 1} of {STEPS.length}</div>
        <h2>{STEPS[step].title}</h2>
        <p>{STEPS[step].desc}</p>
        <div className={styles.actions}>
          <button onClick={handleNext}>{step < STEPS.length - 1 ? 'Next' : 'Finish'}</button>
          <button onClick={handleSkip}>Skip</button>
          <button onClick={handleDontShow}>Don't show again</button>
        </div>
      </div>
    </div>
  );
}
