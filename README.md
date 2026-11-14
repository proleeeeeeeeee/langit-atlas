# Langit Atlas · 星野手记

马来西亚的星空摄影规划工具。输入地名、经纬度，或使用当前位置，查看当晚适合拍摄的时段、云量、月光与镜头朝向。界面支持简体中文和 English。

选点后可比较今晚、明晚、后晚的拍摄窗口及窗口内的平均云量，点日期查看当晚的详细计划。地点光污染表显示人工与自然天光的亮度比，并标出所在区间。星图提供银河背景和十二组星座连线。选好方向和焦距后，固定机位预演可显示星空怎样逐小时移过画面。

Choose a location in Malaysia to plan a night of astrophotography. The planner combines hourly cloud and rain forecasts with astronomical darkness, moonlight and a historical sky-brightness estimate. Tap a place name on the map to select it, or toggle the light pollution overlay to see the base map. In the viewfinder, a dashed line traces the subject’s next hour. Choose a 14, 24 or 35 mm full-frame equivalent lens and play the hourly sky preview with the camera held in place.

**Project author** · [@proleeeeeeeeee](https://github.com/proleeeeeeeeee)

The three-night table compares forecast-supported windows at one location. The skyglow scale marks the local artificial-to-natural brightness ratio. Explore twelve constellation figures and the Galactic band in the interactive chart, using the selected date, hour and coordinates.

## Local development

Install a Node.js version supported by Vite (20.19+ on the 20.x branch, or 22.12+), then run from the project directory.

```sh
npm ci
npm run dev
```

Use `npm run check` for TypeScript checks or `npm run build` to check and produce the static site in `dist/`. Run `npm run preview` to serve the production build locally. Device location requires browser permission and a secure context such as HTTPS or localhost.

## Data and credits

- Open-Meteo supplies hourly weather forecasts. Astronomy Engine calculates sky positions and lunar events. [Forecast documentation](https://open-meteo.com/en/docs) · [Astronomy Engine](https://github.com/cosinekitty/astronomy)
- Sky brightness comes from the Falchi et al. World Atlas, using 2014 night lights. The map notes include the model date, processing steps and licences for the atlas, place names and geographic layers. [Map credits](public/assets/atlas-sources.txt)
- The viewfinder uses a 523-star subset of the HYG Stellar Database by David Nash (Astronexus). [Star catalogue credits](public/assets/STARS-CREDITS.txt)
- Chalizham photographed the cover at Pulau Mawar, Johor. The desktop and mobile covers are crops of the original photograph, licensed under CC BY-SA 4.0. [Original photograph](https://commons.wikimedia.org/wiki/File:Majestic_Milky_Way.jpg) · [Photo licence](https://creativecommons.org/licenses/by-sa/4.0/)
