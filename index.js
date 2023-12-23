import puppeteer from "puppeteer";
import path from "path";

async function getTitle(page, selector) {
  return await page.$eval(selector, (titleElement) =>
    titleElement.textContent.trim()
  );
}

async function getDescription(page, selector) {
  return await page.$eval(selector, (descriptionElement) =>
    descriptionElement.textContent.trim()
  );
}
async function getMainImage(page) {
  const selector = 'a[data-testid="contentPromoEmbedWrapper"] span picture img';
  const promotionImage = await page.$eval(selector, (descriptionElement) => {
    const srcset = descriptionElement.srcset;
    const sources = srcset.split(", ");

    const url320w = sources.find((source) => source.includes("320w"));
    const imageUrl320w = url320w ? url320w.split(" ")[0] : null;
    return imageUrl320w;
  });
  return promotionImage;
}

async function getThumbnailUrl(page, iframeSelector) {
  const iframe = await page.$(iframeSelector);

  if (!iframe) {
    const mainImage = getMainImage(page);
    return mainImage;
  }

  const videoUrl = await iframe.evaluate((iframe) => iframe.src);
  const videoIdMatch = videoUrl.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  return videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : null;
}

async function getImages(page, selector) {
  const items = await page.$$(`${selector} img`);

  const arr = [];
  for (let item of items) {
    const srcset = await page.evaluate((img) => img.srcset, item);
    const imageUrl240w = srcset
      .split(", ")
      .find((url) => url.includes("/w_240,"));
    arr.push(imageUrl240w);
  }

  return arr;
}

(async () => {
  try {
    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const __filename = new URL(import.meta.url).pathname;
    const __dirname = path.dirname(__filename);

    await page.setViewport({ width: 1080, height: 1024 });

    if (!process.argv[2]) {
      console.log("Necesito la url");
      return;
    }
    const url = process.argv[2];

    await page.goto(url);

    const title = await getTitle(page, 'h1[data-testid="SectionHeaderHed"]');
    const description = await getDescription(
      page,
      'p[data-testid="SectionHeaderSubhed"]'
    );
    const bodyContainerSelector = ".body__inner-container";
    const bodyContainerContent = await page.$eval(
      bodyContainerSelector,
      (bodyElement) => {
        const elementsToExclude = Array.from(
          bodyElement.querySelectorAll(
            ".AdWrapper-dQtivb.fZrssQ.ad.ad--in-content, " +
              ".journey-unit__container"
          )
        );
        elementsToExclude.forEach((element) => {
          element.remove();
        });

        return bodyElement.innerHTML;
      }
    );

    const thumbnailUrl = await getThumbnailUrl(
      page,
      'figure[data-testid="IframeEmbed"] iframe'
    );

    await page.waitForSelector(".GalleryThumbnailFigure-duXHLP");
    const images = await getImages(page, ".GalleryThumbnailFigure-duXHLP");
    const imagesHtml = images.map((el) => `<img src="${el}" alt="">`).join("");

    const newHtmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kindle-Vogue</title>
            <style>
  
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <p>${description}</p>
            <img src="${thumbnailUrl}" alt="">
            
            ${bodyContainerContent}
            ${imagesHtml}
  
        </body>
        </html>
      `;

    await page.setContent(newHtmlContent, { waitUntil: "networkidle0" });
    await page.pdf({ path: `${description}.pdf`, format: "A4" });
    await browser.close();
  } catch (error) {
    console.error("Ocurrió un error:", error);
  }
})();
