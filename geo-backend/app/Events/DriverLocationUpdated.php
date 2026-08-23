<?php

namespace App\Events;

use App\Models\DriverReport;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;  // <-- تغيير هنا
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DriverLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public $driverReport;

    public function __construct(DriverReport $driverReport)
    {
        $this->driverReport = $driverReport;
    }

    public function broadcastOn()
    {
        return new Channel('driver-locations');
    }

    public function broadcastAs()
    {
        return 'DriverLocationUpdated';
    }

    public function broadcastWith()
    {
        return [
            'id' => $this->driverReport->id,
            'driver_id' => $this->driverReport->driver_id,
            'latitude' => (float) $this->driverReport->latitude,
            'longitude' => (float) $this->driverReport->longitude,
            'type' => $this->driverReport->type,
            'created_at' => $this->driverReport->created_at->toISOString(),
        ];
    }
}