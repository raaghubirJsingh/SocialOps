import { Badge } from '@/components/ui/badge';
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from '@/types/social-account';

/**
 * Platform label pill. The platform list is the approved V1 set only
 * (Instagram, Facebook, YouTube) - no X/WhatsApp value can be rendered.
 */
export function PlatformBadge({ platform }: { platform: SocialPlatform }) {
  return <Badge variant="info">{SOCIAL_PLATFORM_LABELS[platform]}</Badge>;
}