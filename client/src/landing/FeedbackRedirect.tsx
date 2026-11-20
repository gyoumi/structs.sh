import { useEffect } from 'react';
import { FEEDBACK_FORM_URL } from './content';

const FeedbackRedirect = () => {
  useEffect(() => {
    window.location.replace(FEEDBACK_FORM_URL);
  }, []);
  return null;
};

export default FeedbackRedirect;
