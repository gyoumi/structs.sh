import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Landing from '@/landing/Landing';
import Visualiser from '@/visualiser/Visualiser';

export const renderVisualiser = async (path = '/visualiser/linked-lists') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Landing</p>} />
        <Route path="/visualiser/:topic/:data?" element={<Visualiser />} />
      </Routes>
    </MemoryRouter>
  );
  await act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      })
  );
};

export const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </MemoryRouter>
  );
