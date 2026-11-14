<?php

declare(strict_types=1);

namespace App\Services\Ticket;

use App\Support\UpstreamJwt;
use InvalidArgumentException;

final class TicketUpstreamCallbackToken
{
    public static function forServiceId(int $serviceId, ?string $applicationKey = null): string
    {
        if ($serviceId <= 0) {
            throw new InvalidArgumentException('服务 ID 必须为正整数');
        }

        $key = $applicationKey ?? (string) config('app.key', '');
        if (! UpstreamJwt::isUsableKey($key)) {
            throw new InvalidArgumentException('工单回调签名密钥必须使用至少 32 字节的真实 APP_KEY');
        }

        // 保持现有回调 HMAC 算法与输入，避免对已部署上游造成无预告的签名不兼容。
        return hash_hmac('md5', 'ticket-upstream-callback:'.$serviceId, $key);
    }
}
