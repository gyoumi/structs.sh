import { DAILY_12 } from '../support/daily-fixtures';
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

  test('opens the debugger', async ({ landingPage, page }) => {
    await landingPage.open();
    await landingPage.openDebugger();
    await expect(page, 'Clicking Debugger in the landing Main navbar should go to /debugger').toHaveURL(/\/debugger$/);
  });

  test('opens the daily puzzle from the navbar', async ({ landingPage, page }) => {
    await landingPage.open();
    await landingPage.openDailyFromNav();
    await expect(page, 'Clicking "Daily puzzle" in the landing Main navbar should go to /daily').toHaveURL(/\/daily$/);
  });

  test('opens the daily puzzle from the hero', async ({ landingPage, page }) => {
    await landingPage.open();
    await landingPage.openDailyFromHero();
    await expect(page, 'Clicking "Play today\'s puzzle" in the landing hero should go to /daily').toHaveURL(/\/daily$/);
  });

  test('introduces the daily puzzle and opens it', async ({ landingPage, dailyPage, page }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await landingPage.open();
    await landingPage.expectDailyPromoInfo();
    await landingPage.openDailyFromPromo();
    await expect(
      page,
      'Clicking "Play today\'s puzzle" in the landing Daily puzzle section should go to /daily',
    ).toHaveURL(/\/daily$/);
    await dailyPage.openFromMainNav('Debugger');
    await expect(page, '/daily (serving DAILY_12): clicking Debugger in the header Main nav should go to /debugger').toHaveURL(
      /\/debugger$/,
    );
  });

  test('returns from /daily to the structure picker on desktop and phone without overflow', async ({
    landingPage,
    dailyPage,
    page,
  }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();
    await dailyPage.openFromMainNav('Visualiser');
    await expect(page, '/daily (desktop): clicking Visualiser in Main nav should go to /#structures').toHaveURL(/\/#structures$/);
    await landingPage.expectStructuresInViewport('/daily -> Visualiser at desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await dailyPage.open();
    await landingPage.expectNoHorizontalOverflow('/daily at 390x844');
    await dailyPage.openFromMainNav('Visualiser');
    await expect(page, '/daily (390x844): clicking Visualiser in Main nav should go to /#structures').toHaveURL(/\/#structures$/);
    await landingPage.expectStructuresInViewport('/daily -> Visualiser at 390x844');
    await landingPage.expectNoHorizontalOverflow('landing /#structures at 390x844');
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
