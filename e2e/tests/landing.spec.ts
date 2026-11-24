import { DAILY_12 } from '../support/daily-fixtures';
import type { LandingPage } from '../support/landing-page';
import { test, expect } from '../support/test';
import { topicTitles, type TopicSlug } from '../support/topics';

const FEEDBACK_FORM = 'docs.google.com/forms/d/e/1FAIpQLScg9AuvsDcrgjzNX3D10l2r09UhQS0WaGiyX3OvyRn4BlwBSQ';

const sponsors = [
  'https://www.hudsonrivertrading.com/',
  'https://www.janestreet.com/',
  'https://www.lyratechnologies.com.au/',
  'https://careers.thetradedesk.com/',
  'https://www.airwallex.com/au',
  'https://www.arista.com/en/',
  'https://www.atlassian.com/',
  'https://www.qube-rt.com/',
];

test.describe('landing page', () => {
  for (const topic of Object.keys(topicTitles) as TopicSlug[]) {
    test(`opens the ${topicTitles[topic]} visualiser`, async ({ landingPage, page }) => {
      await landingPage.open();
      await landingPage.openTopic(topic);
      await expect(page, `Opening ${topicTitles[topic]} from the landing page should go to /visualiser/${topic}`).toHaveURL(
        new RegExp(`/visualiser/${topic}$`),
      );
    });
  }

  const entryPoints = [
    {
      name: 'opens the debugger',
      open: (landingPage: LandingPage) => landingPage.openDebugger(),
      url: /\/debugger$/,
      message: 'Clicking Debugger in the landing Main navbar should go to /debugger',
    },
    {
      name: 'opens the daily challenge from the navbar',
      open: (landingPage: LandingPage) => landingPage.openDailyFromNav(),
      url: /\/daily$/,
      message: 'Clicking "Daily" in the landing Main navbar should go to /daily',
    },
    {
      name: 'opens the daily challenge from the hero',
      open: (landingPage: LandingPage) => landingPage.openDailyFromHero(),
      url: /\/daily$/,
      message: 'Clicking "Play today\'s challenge" in the landing hero should go to /daily',
    },
  ];
  for (const { name, open, url, message } of entryPoints) {
    test(name, async ({ landingPage, page }) => {
      await landingPage.open();
      await open(landingPage);
      await expect(page, message).toHaveURL(url);
    });
  }

  test('introduces the daily challenge, opens it, and returns with Go back', async ({ landingPage, dailyPage, page }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await landingPage.open();
    await landingPage.expectDailyPromoInfo();
    await landingPage.openDailyFromPromo();
    await expect(
      page,
      'Clicking "Play today\'s challenge" in the landing Daily challenge section should go to /daily',
    ).toHaveURL(/\/daily$/);
    await dailyPage.goBack();
    await expect(page, '/daily (opened from /): clicking "Go back" should return to /').toHaveURL(/\/$/);
  });

  test('returns from /daily to the previous visualiser page or home on desktop and phone without overflow', async ({
    landingPage,
    visualiser,
    dailyPage,
    page,
  }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await visualiser.open('avl-trees');
    await visualiser.openDaily();
    await dailyPage.goBack();
    await expect(
      page,
      '/daily (opened from /visualiser/avl-trees): clicking "Go back" should return to /visualiser/avl-trees',
    ).toHaveURL(/\/visualiser\/avl-trees$/);

    await page.setViewportSize({ width: 390, height: 844 });
    await dailyPage.open();
    await landingPage.expectNoHorizontalOverflow('/daily at 390x844');
    await dailyPage.goHome();
    await expect(page, '/daily (390x844): clicking the structs.sh home logo should go to /').toHaveURL(/\/$/);
    await landingPage.expectNoHorizontalOverflow('/ at 390x844');
  });

  test('Go back on a direct /daily visit falls back to the landing page', async ({ dailyPage, page }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();
    await dailyPage.goBack();
    await expect(page, '/daily (opened directly with no prior in-app page): clicking "Go back" should go to /').toHaveURL(
      /\/$/,
    );
  });

  test('links to the source code and the team', async ({ landingPage }) => {
    await landingPage.open();
    expect(await landingPage.externalLinks(), 'Landing page external links should include GitHub, the team email, DevSoc and Facebook').toEqual(
      expect.arrayContaining([
        'https://github.com/devsoc-unsw/structs.sh',
        'mailto:structs@devsoc.app',
        'https://devsoc.app/',
        'https://www.facebook.com/devsocUNSW',
      ]),
    );
  });

  test('credits every sponsor', async ({ landingPage }) => {
    await landingPage.open();
    expect(await landingPage.externalLinks(), 'Landing page external links should include every sponsor').toEqual(
      expect.arrayContaining(sponsors),
    );
  });

  test('leads to the feedback form', async ({ landingPage }) => {
    await landingPage.open();
    expect(await landingPage.feedbackFormUrl(), 'The footer Feedback link should point to the Google feedback form').toContain(
      FEEDBACK_FORM,
    );
  });

  test('the /feedback address leads to the feedback form', async ({ landingPage }) => {
    expect(await landingPage.feedbackAddressTarget(), 'Opening /feedback should load the Google feedback form').toContain(
      FEEDBACK_FORM,
    );
  });
});
