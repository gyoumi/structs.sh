import { useEffect } from 'react';
import { FEEDBACK_FORM } from './content';

const FeedbackRedirect = () => {
  useEffect(() => {
    window.location.replace(FEEDBACK_FORM);
  }, []);
  return null;
};

export default FeedbackRedirect;
