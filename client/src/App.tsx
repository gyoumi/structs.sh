import Box from '@mui/material/Box';
import { ThemeProvider } from '@mui/material/styles';
import { AnimatePresence } from 'framer-motion';
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import Daily from '@/daily/Daily';
import FeedbackRedirect from '@/landing/FeedbackRedirect';
import Landing from '@/landing/Landing';
import NotFound from '@/landing/NotFound';
import { structsTheme } from '@/structsThemes';
import Visualiser from '@/visualiser/Visualiser';
import './App.scss';
import '@/visualiser-src/linked-list-visualiser/styles/visualiser.css';
import DevelopmentMode from '@/visualiser-debugger/DevelopmentMode';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { useEffect, useLayoutEffect } from 'react';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import Toast from '@/visualiser-debugger/Component/Toast/Toast';

/** Opens each new page at the top, or scrolls to the hash target when a route includes one. */
const useScrollToTopOnNavigate = () => {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView();
        target.focus({ preventScroll: true });
        return;
      }
    }
    if (navigationType !== 'POP' && !hash) window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);
};

const App = () => {
  useScrollToTopOnNavigate();

  useEffect(() => {
    // @ts-ignore
    window.globalStore = useGlobalStore;
    // @ts-ignore
    window.frontendStore = useFrontendStateStore;
  }, []);

  return (
    <Box color={structsTheme.palette.text.primary}>
      <AnimatePresence>
        <ThemeProvider theme={structsTheme}>
          <Routes>
            {/* Homepage */}
            <Route path="/" element={<Landing />} />

            {/* Visualiser routes */}
            <Route path="/visualiser/:topic/:data?" element={<Visualiser />} />

            {/* Daily puzzle */}
            <Route path="/daily" element={<Daily />} />

            {/* Feedback and feature request page */}
            <Route path="/feedback" element={<FeedbackRedirect />} />

            {/* Development mode */}
            <Route path="/debugger" element={<DevelopmentMode />} />

            {/* 404 page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/** For Providing warning/info/context of the app at anytime */}
          <Toast />
        </ThemeProvider>
      </AnimatePresence>
    </Box>
  );
};

export default App;
