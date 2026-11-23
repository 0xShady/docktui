import type blessed from 'neo-blessed';
import { listNetworks, removeNetwork } from '@docker/networks';
import type { NetworkInfo } from '@models/docker';
import { t } from '@theme';
import { relativeTime, truncate } from '@utils/format';
import { ResourceListTab } from '@ui/resource-list-tab';
import type { Dims } from '@ui/widgets';

export class NetworksTab extends ResourceListTab<NetworkInfo> {
  constructor(screen: blessed.Widgets.Screen, dims: Dims) {
    super(screen, dims, {
      list: listNetworks,
      remove: (net) => removeNetwork(net.id),
      getKey: (net) => net.id,
      emptyMessage: 'No networks',
      confirmTitle: 'Remove network?',
      confirmLabel: (net) => net.name,
      guards: [
        (net) => (net.builtin ? 'Built-in network — cannot delete' : null),
        (net) => (net.inUse ? 'Network in use — cannot delete' : null),
      ],
      columns: [
        { header: 'NAME', weight: 0.22, min: 14, floor: 12, render: (net, w) => truncate(net.name, w - 1) },
        { header: 'DRIVER', weight: 0.12, min: 8, floor: 7, render: (net, w) => truncate(net.driver, w - 1) },
        {
          header: 'SCOPE',
          weight: 0.1,
          min: 7,
          floor: 6,
          render: (net, w) => t.comment(truncate(net.scope, w - 1)),
        },
        {
          header: 'ID',
          weight: 0.14,
          min: 13,
          floor: 5,
          render: (net, w) => t.comment(truncate(net.id.slice(0, 12), w - 1)),
        },
        {
          header: 'CTNRS',
          weight: 0.09,
          min: 6,
          floor: 3,
          render: (net) => (net.containerCount > 0 ? String(net.containerCount) : t.faint('0')),
        },
        {
          header: 'CREATED',
          weight: 0.15,
          min: 18,
          floor: 8,
          render: (net, w) =>
            net.created.getTime() > 0
              ? t.comment(truncate(relativeTime(net.created), w - 1))
              : t.comment('—'),
        },
        {
          header: 'STATUS',
          weight: 0,
          min: 10,
          floor: 10,
          render: (net, w) => (net.inUse ? t.green(truncate('● in use', w)) : t.red(truncate('○ unused', w))),
        },
      ],
    });
  }
}
