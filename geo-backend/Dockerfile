FROM php:8.3-cli-alpine

RUN apk add --no-cache postgresql-dev libzip-dev libpng-dev libjpeg-turbo-dev freetype-dev oniguruma-dev

RUN docker-php-ext-install pdo_pgsql pgsql zip gd bcmath pcntl posix

RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /var/www

COPY . .

RUN composer install --no-dev --optimize-autoloader

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]