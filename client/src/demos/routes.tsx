import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Route } from 'react-router-dom';

interface Demo {
  Landing: LazyExoticComponent<ComponentType>;
  Visualiser: LazyExoticComponent<ComponentType>;
}

// Each demo is its own chunk, so its fonts and styles load only when its route is opened.
const demos: Demo[] = [
  {
    Landing: lazy(() => import('./demo1/Landing')),
    Visualiser: lazy(() => import('./demo1/Visualiser')),
  },
  {
    Landing: lazy(() => import('./demo2/Landing')),
    Visualiser: lazy(() => import('./demo2/Visualiser')),
  },
  {
    Landing: lazy(() => import('./demo3/Landing')),
    Visualiser: lazy(() => import('./demo3/Visualiser')),
  },
  {
    Landing: lazy(() => import('./demo4/Landing')),
    Visualiser: lazy(() => import('./demo4/Visualiser')),
  },
  {
    Landing: lazy(() => import('./demo5/Landing')),
    Visualiser: lazy(() => import('./demo5/Visualiser')),
  },
];

/** `/1` to `/5` are the landing pages, and `/1/visualiser/:topic` and so on are the visualisers. */
export const demoRoutes = demos.flatMap(({ Landing, Visualiser }, index) => {
  const base = `/${index + 1}`;
  return [
    <Route
      key={base}
      path={base}
      element={
        <Suspense fallback={null}>
          <Landing />
        </Suspense>
      }
    />,
    <Route
      key={`${base}/visualiser`}
      path={`${base}/visualiser/:topic`}
      element={
        <Suspense fallback={null}>
          <Visualiser />
        </Suspense>
      }
    />,
  ];
});
