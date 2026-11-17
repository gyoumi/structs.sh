import { test, expect } from '../support/test';
import { topicTitles, type TopicSlug } from '../support/visualiser-page';

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
      await expect(page).toHaveURL(new RegExp(`/visualiser/${topic}$`));
    });
  }

  test('opens the debugger', async ({ landingPage, page }) => {
    await landingPage.open();
    await landingPage.openDebugger();
    await expect(page).toHaveURL(/\/debugger$/);
  });

  test('links to the source code and the team', async ({ landingPage }) => {
    await landingPage.open();
    expect(await landingPage.externalLinks()).toEqual(
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
    expect(await landingPage.externalLinks()).toEqual(expect.arrayContaining(sponsors));
  });

  test('leads to the feedback form', async ({ landingPage }) => {
    await landingPage.open();
    expect(await landingPage.feedbackFormUrl()).toContain(FEEDBACK_FORM);
  });
});
