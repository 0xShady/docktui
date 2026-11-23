import type blessed from 'neo-blessed';
import { listImages, removeImage } from '@docker/images';
import type { ImageInfo } from '@models/docker';
import { t } from '@theme';
import { humanSizeMB, relativeTime, truncate } from '@utils/format';
import { ResourceListTab } from '@ui/resource-list-tab';
import type { Dims } from '@ui/widgets';

export class ImagesTab extends ResourceListTab<ImageInfo> {
  constructor(screen: blessed.Widgets.Screen, dims: Dims) {
    super(screen, dims, {
      list: listImages,
      remove: (img) => removeImage(img.id),
      getKey: (img) => img.id,
      emptyMessage: 'No images',
      confirmTitle: 'Remove image?',
      confirmLabel: (img) => `${img.repository}:${img.tag}`,
      guards: [(img) => (img.inUse ? 'Image in use — cannot delete' : null)],
      columns: [
        {
          header: 'REPOSITORY',
          weight: 0.25,
          min: 14,
          floor: 10,
          render: (img, w) => truncate(img.repository, w - 1),
        },
        {
          header: 'TAG',
          weight: 0.12,
          min: 8,
          floor: 5,
          render: (img, w) => t.cyan(truncate(img.tag, w - 1)),
        },
        {
          header: 'ID',
          weight: 0.1,
          min: 13,
          floor: 8,
          render: (img, w) => t.comment(truncate(img.id.replace('sha256:', '').slice(0, 12), w - 1)),
        },
        {
          header: 'CREATED',
          weight: 0.15,
          min: 18,
          floor: 9,
          render: (img, w) => t.comment(truncate(relativeTime(img.created), w - 1)),
        },
        {
          header: 'SIZE',
          weight: 0.1,
          min: 9,
          floor: 8,
          render: (img, w) => truncate(humanSizeMB(img.sizeMB), w - 1),
        },
        {
          header: 'STATUS',
          weight: 0,
          min: 10,
          floor: 10,
          render: (img, w) => (img.inUse ? t.green(truncate('● in use', w)) : t.red(truncate('○ unused', w))),
        },
      ],
    });
  }
}
