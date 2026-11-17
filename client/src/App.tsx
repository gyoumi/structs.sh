import Box from '@mui/material/Box';
import { ThemeProvider } from '@mui/material/styles';
import { AnimatePresence } from 'framer-motion';
import { Route, Routes } from 'react-router-dom';
import Feedback from '@/Feedback';
import Landing from '@/landing/Landing';
import Page404 from '@/Page404';
import { structsTheme } from '@/structsThemes';
import Visualiser from '@/visualiser/Visualiser';
import './App.scss';
import '@/visualiser-src/linked-list-visualiser/styles/visualiser.css';
import DevelopmentMode from '@/visualiser-debugger/DevelopmentMode';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { useEffect } from 'react';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import Toast from '@/visualiser-debugger/Component/Toast/Toast';

const App = () => {
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

            {/* Feedback and feature request page */}
            <Route path="/feedback" element={<Feedback />} />

            {/* Development mode */}
            <Route path="/debugger" element={<DevelopmentMode />} />

            {/* 404 page */}
            <Route path="*" element={<Page404 />} />
          </Routes>
          {/** For Providing warning/info/context of the app at anytime */}
          <Toast />
        </ThemeProvider>
      </AnimatePresence>
    </Box>
  );
};

export default App;
