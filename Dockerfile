FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html style.css state.js projects.js gallery.js /usr/share/nginx/html/
COPY images/manifest.js /usr/share/nginx/html/images/
COPY images/opt        /usr/share/nginx/html/images/opt
COPY typefaces         /usr/share/nginx/html/typefaces

# editor.js is intentionally not shipped; drop its <script> tag so the page
# doesn't fire a 404 on load.
RUN sed -i '/editor\.js/d' /usr/share/nginx/html/index.html
