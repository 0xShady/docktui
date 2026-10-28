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
        { header: 'REPOSITORY', weight: 0.25, render: (img, w) => truncate(img.repository, w - 1) },
        { header: 'TAG', weight: 0.12, render: (img, w) => t.cyan(truncate(img.tag, w - 1)) },
        {
          header: 'ID',
          weight: 0.1,
          render: (img) => t.comment(img.id.replace('sha256:', '').slice(0, 12)),
        },
        { header: 'CREATED', weight: 0.15, render: (img) => t.comment(relativeTime(img.created)) },
        { header: 'SIZE', weight: 0.1, render: (img) => humanSizeMB(img.sizeMB) },
        {
          header: 'STATUS',
          weight: 0,
          render: (img) => (img.inUse ? t.green('● in use') : t.red('○ unused')),
        },
      ],
    });
  }
}
