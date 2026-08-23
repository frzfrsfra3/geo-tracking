<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis;');

        Schema::create('driver_reports', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('driver_id');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('type')->default('location');
            $table->geography('location', 'POINT', 4326)->nullable(); // PostGIS geography column
            $table->timestamps();

            $table->index('driver_id');
        });

        DB::statement('CREATE INDEX driver_reports_location_gix ON driver_reports USING GIST (location);');
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_reports');
    }
};
