import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../helpers/date_formatters.dart';
import '../models/saved_location.dart';
import '../models/trip.dart';
import '../models/trip_cluster.dart';
import '../services/auth_service.dart';
import '../state/trip_state.dart';
import 'app_button.dart';
import 'group_chooser.dart';
import 'location_trip_chooser.dart';

enum SortMode {
  newest('Newest'),
  oldest('Oldest'),
  nameAsc('A → Z'),
  nameDesc('Z → A');

  const SortMode(this.label);

  final String label;
}

enum _TripAction {
  showOnMap,
  toggleHidden,
  addToGroup,
  share,
  edit,
  routeGuidance,
}

enum _ClusterAction { showOnMap, toggleHidden, rename, delete }

sealed class _ListItem {
  const _ListItem();
}

class _GroupItem extends _ListItem {
  const _GroupItem(this.cluster, this.members);

  final TripCluster? cluster;
  final List<Trip> members;
}

class _TripRowItem extends _ListItem {
  const _TripRowItem(this.trip, {required this.groupHidden});

  final Trip trip;
  final bool groupHidden;
}

/// Port of V1 `components/SideBar.svelte`.
class SideBar extends StatefulWidget {
  const SideBar({
    super.key,
    required this.onShowTrips,
    required this.onRouteGuidance,
    required this.onClose,
  });

  final ValueChanged<List<int>> onShowTrips;
  final ValueChanged<int> onRouteGuidance;
  final VoidCallback onClose;

  @override
  State<SideBar> createState() => _SideBarState();
}

class _SideBarState extends State<SideBar> {
  final _searchController = TextEditingController();

  String _searchQuery = '';
  SortMode _sortMode = SortMode.newest;
  bool _showTrash = false;
  bool _ungroupedExpanded = true;
  final Set<int> _collapsedClusters = {};

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<TripState>();
    final auth = context.watch<AuthService>();

    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _header(auth, state),
          if (!_showTrash) ...[
            _searchRow(),
            if (state.selectedTripIds.isNotEmpty)
              _selectionToolbar(state, auth),
            Expanded(child: _tripList(state, auth)),
            _footer(state, auth),
          ] else
            Expanded(child: _trashList(state)),
        ],
      ),
    );
  }

  Widget _header(AuthService auth, TripState state) {
    return Container(
      color: kSidebarHeaderBackground,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Row(
        children: [
          if (_showTrash)
            TextButton.icon(
              onPressed: () => setState(() => _showTrash = false),
              icon: const Icon(Icons.chevron_left, size: 18),
              label: const Text(
                'Trips',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              style: TextButton.styleFrom(
                foregroundColor: kPrimaryBlue,
                padding: EdgeInsets.zero,
              ),
            )
          else ...[
            const Text(
              'Trips',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: kDarkText,
              ),
            ),
            if (auth.isLoggedIn) ...[
              const SizedBox(width: 10),
              const Text(
                'Logged in',
                style: TextStyle(fontSize: 12, color: kMutedText),
              ),
              const SizedBox(width: 4),
              TextButton(
                onPressed: () => _logout(state),
                style: TextButton.styleFrom(
                  foregroundColor: kPrimaryBlue,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 30),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Log out', style: TextStyle(fontSize: 12)),
              ),
            ],
          ],
          const Spacer(),
          IconButton(
            onPressed: widget.onClose,
            tooltip: 'Close sidebar',
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.close, size: 18),
          ),
        ],
      ),
    );
  }

  Widget _searchRow() {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: kSearchBackground,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search, size: 15, color: kMutedText),
                  const SizedBox(width: 6),
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      onChanged: (value) =>
                          setState(() => _searchQuery = value),
                      style: const TextStyle(fontSize: 13.5),
                      decoration: const InputDecoration(
                        hintText: 'Search trips...',
                        hintStyle: TextStyle(fontSize: 13.5),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 9),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 6),
          TextButton(
            onPressed: _cycleSort,
            style: TextButton.styleFrom(
              backgroundColor: kSearchBackground,
              foregroundColor: kDarkText,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              minimumSize: const Size(0, 34),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_sortMode.label, style: const TextStyle(fontSize: 12.8)),
                const SizedBox(width: 4),
                const Icon(Icons.swap_vert, size: 14),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _selectionToolbar(TripState state, AuthService auth) {
    final selected = state.selectedTripIdsList;
    return Container(
      color: const Color(0xFFFFFBEA),
      padding: const EdgeInsets.all(8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          AppButton(
            small: true,
            label: 'Show selected',
            icon: Icons.visibility_outlined,
            onPressed: () => widget.onShowTrips(selected),
          ),
          AppButton(
            small: true,
            label: 'Clear',
            icon: Icons.close,
            color: kSecondaryGrey,
            onPressed: state.clearSelection,
          ),
          AppButton(
            small: true,
            label: 'Remove',
            icon: Icons.delete_outline,
            color: kDangerRed,
            onPressed: () => _removeSelected(state),
          ),
          if (auth.isLoggedIn)
            AppButton(
              small: true,
              label: 'Add to group',
              icon: Icons.create_new_folder_outlined,
              color: kSecondaryGrey,
              onPressed: () => _addToGroup(state, selected, clearAfter: true),
            ),
        ],
      ),
    );
  }

  Widget _tripList(TripState state, AuthService auth) {
    final items = _buildDisplayItems(state, auth);

    return ListView(
      children: [
        for (final item in items)
          switch (item) {
            _GroupItem() => _groupHeader(state, auth, item),
            _TripRowItem() => _tripRow(state, auth, item),
          },
        if (state.locations.isNotEmpty) ...[
          _sectionHeader(label: 'Locations', count: state.locations.length),
          for (final location in state.locations) _locationRow(state, location),
        ],
        if (state.tripsError != null)
          _errorBox(
            'Failed to load trips — is the server running?\n${state.tripsError}',
            retry: state.loadTrips,
          )
        else if (state.tripsLoading && items.isEmpty)
          const Padding(
            padding: EdgeInsets.all(20),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (items.isEmpty && state.locations.isEmpty)
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              _searchQuery.trim().isNotEmpty
                  ? 'No trips match your search.'
                  : 'No trips yet.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: kMutedText),
            ),
          ),
      ],
    );
  }

  Widget _groupHeader(TripState state, AuthService auth, _GroupItem item) {
    final cluster = item.cluster;
    final expanded = cluster == null
        ? _ungroupedExpanded
        : !_collapsedClusters.contains(cluster.id);

    return Material(
      color: kGroupHeaderBackground,
      child: InkWell(
        onTap: () {
          setState(() {
            if (cluster == null) {
              _ungroupedExpanded = !_ungroupedExpanded;
            } else if (_collapsedClusters.contains(cluster.id)) {
              _collapsedClusters.remove(cluster.id);
            } else {
              _collapsedClusters.add(cluster.id);
            }
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: kLightBorder)),
          ),
          child: Row(
            children: [
              Icon(
                expanded ? Icons.expand_more : Icons.chevron_right,
                size: 18,
                color: kMutedText,
              ),
              if (cluster != null) ...[
                const Icon(Icons.folder_outlined, size: 16),
                const SizedBox(width: 4),
              ],
              Expanded(
                child: Text(
                  cluster?.name ?? 'Ungrouped',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.6,
                    fontWeight: FontWeight.w600,
                    color: kDarkText,
                  ),
                ),
              ),
              _CountBadge(count: item.members.length),
              if (cluster?.hidden ?? false)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(
                    Icons.visibility_off_outlined,
                    size: 14,
                    color: kAccentOrange,
                  ),
                ),
              if (cluster != null)
                PopupMenuButton<_ClusterAction>(
                  tooltip: 'Group actions',
                  padding: EdgeInsets.zero,
                  iconSize: 18,
                  icon: const Icon(Icons.more_horiz, color: kMutedText),
                  onSelected: (action) =>
                      _handleClusterAction(state, cluster, item, action),
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: _ClusterAction.showOnMap,
                      child: _MenuLabel(
                        icon: Icons.place_outlined,
                        label: 'Show group on map',
                      ),
                    ),
                    if (auth.isLoggedIn) ...[
                      PopupMenuItem(
                        value: _ClusterAction.toggleHidden,
                        child: _MenuLabel(
                          icon: cluster.hidden
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          label: cluster.hidden
                              ? 'Show publicly'
                              : 'Hide from public',
                        ),
                      ),
                      const PopupMenuItem(
                        value: _ClusterAction.rename,
                        child: _MenuLabel(
                          icon: Icons.edit_outlined,
                          label: 'Rename group',
                        ),
                      ),
                      const PopupMenuItem(
                        value: _ClusterAction.delete,
                        child: _MenuLabel(
                          icon: Icons.delete_outline,
                          label: 'Delete group',
                        ),
                      ),
                    ],
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tripRow(TripState state, AuthService auth, _TripRowItem item) {
    final trip = item.trip;
    final selected = state.isTripSelected(trip.id);
    final highlighted = state.isTripHighlighted(trip.id);

    final decoration = selected
        ? const BoxDecoration(color: kSelectedBackground)
        : highlighted
        ? const BoxDecoration(
            color: kHighlightedBackground,
            border: Border(left: BorderSide(color: kAccentOrange, width: 3)),
          )
        : const BoxDecoration(
            border: Border(bottom: BorderSide(color: kLightBorder)),
          );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => state.toggleSelected(trip.id),
        child: Container(
          padding: EdgeInsets.fromLTRB(
            item.groupHidden || trip.clusterId != null ? 28 : 10,
            8,
            6,
            8,
          ),
          decoration: decoration,
          child: Row(
            children: [
              SizedBox(
                width: 32,
                height: 32,
                child: Checkbox(
                  value: selected,
                  onChanged: (_) => state.toggleSelected(trip.id),
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            formatTripName(trip),
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14.4,
                              color: kDarkText,
                            ),
                          ),
                        ),
                        if (trip.hidden || item.groupHidden)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Icon(
                              Icons.visibility_off_outlined,
                              size: 13,
                              color: kAccentOrange,
                            ),
                          ),
                      ],
                    ),
                    Text(
                      '${formatDate(trip.startedAt)}'
                      '${trip.pointCount > 0 ? ' · ${trip.pointCount} pts' : ''}',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.2, color: kMutedText),
                    ),
                  ],
                ),
              ),
              if (highlighted)
                Container(
                  margin: const EdgeInsets.only(right: 4),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: kAccentOrange,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'On map',
                    style: TextStyle(
                      fontSize: 10.4,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              IconButton(
                tooltip: 'Show on map',
                onPressed: () => widget.onShowTrips([trip.id]),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 30,
                  height: 30,
                ),
                icon: const Icon(
                  Icons.place_outlined,
                  size: 18,
                  color: kMutedText,
                ),
              ),
              PopupMenuButton<_TripAction>(
                tooltip: 'Trip actions',
                padding: EdgeInsets.zero,
                iconSize: 18,
                icon: const Icon(Icons.more_vert, size: 18, color: kMutedText),
                onSelected: (action) => _handleTripAction(state, trip, action),
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: _TripAction.showOnMap,
                    child: _MenuLabel(
                      icon: Icons.place_outlined,
                      label: 'Show on map',
                    ),
                  ),
                  if (auth.isLoggedIn) ...[
                    PopupMenuItem(
                      value: _TripAction.toggleHidden,
                      child: _MenuLabel(
                        icon: trip.hidden
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        label: trip.hidden
                            ? 'Show publicly'
                            : 'Hide from public',
                      ),
                    ),
                    const PopupMenuItem(
                      value: _TripAction.addToGroup,
                      child: _MenuLabel(
                        icon: Icons.create_new_folder_outlined,
                        label: 'Add to group',
                      ),
                    ),
                  ],
                  const PopupMenuItem(
                    value: _TripAction.share,
                    child: _MenuLabel(
                      label: 'Share',
                      icon: Icons.share_outlined,
                    ),
                  ),
                  const PopupMenuItem(
                    value: _TripAction.edit,
                    child: _MenuLabel(label: 'Edit', icon: Icons.edit_outlined),
                  ),
                  const PopupMenuItem(
                    value: _TripAction.routeGuidance,
                    child: _MenuLabel(
                      label: 'Route guidance',
                      icon: Icons.navigation_outlined,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _locationRow(TripState state, SavedLocation location) {
    final visited = state.isVisited(location.id);
    final associatedTrip = location.tripId == null
        ? null
        : state.tripById(location.tripId!);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: kLightBorder)),
      ),
      child: Row(
        children: [
          const Icon(Icons.place_outlined, size: 16, color: kMutedText),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  location.name,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.6,
                    color: visited ? kSuccessGreen : kDarkText,
                    fontWeight: visited ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
                if (associatedTrip != null)
                  Text(
                    formatTripName(associatedTrip),
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.2, color: kMutedText),
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Associate with trip',
            onPressed: () => _pickLocationTrip(state, location),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 30, height: 30),
            icon: const Icon(Icons.menu, size: 17, color: kMutedText),
          ),
          IconButton(
            tooltip: visited ? 'Revert visited status' : 'Mark as visited',
            onPressed: () => _runAction(
              () => visited
                  ? state.unmarkVisited(location.id)
                  : state.markVisited(location.id),
              visited
                  ? 'Failed to revert visited status.'
                  : 'Failed to mark as visited.',
            ),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 30, height: 30),
            icon: Icon(
              visited ? Icons.close : Icons.check,
              size: 17,
              color: visited ? kDangerRed : kSuccessGreen,
            ),
          ),
        ],
      ),
    );
  }

  Widget _footer(TripState state, AuthService auth) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: const BoxDecoration(
        color: kControlsBackground,
        border: Border(top: BorderSide(color: kBorder)),
      ),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          AppButton(
            small: true,
            label: 'Add new trip',
            icon: Icons.add,
            onPressed: _addNewTrip,
          ),
          if (auth.isLoggedIn)
            AppButton(
              small: true,
              label: 'Add group',
              icon: Icons.create_new_folder_outlined,
              color: kSecondaryGrey,
              onPressed: _addNewCluster,
            ),
          AppButton(
            small: true,
            label: 'Export trips',
            icon: Icons.download_outlined,
            color: kSecondaryGrey,
            onPressed: () => _exportTrips(state),
          ),
          AppButton(
            small: true,
            label: 'Trash bin',
            icon: Icons.delete_outline,
            color: kSecondaryGrey,
            onPressed: () => setState(() => _showTrash = true),
          ),
        ],
      ),
    );
  }

  Widget _trashList(TripState state) {
    if (state.trashedTrips.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          'Trash bin is empty.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.5, color: kMutedText),
        ),
      );
    }

    return ListView(
      children: [
        for (final trip in state.trashedTrips)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: kLightBorder)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        formatTripName(trip),
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13.6),
                      ),
                      Text(
                        '${formatDate(trip.deletedAt)} · trashed',
                        style: const TextStyle(
                          fontSize: 11.2,
                          color: kMutedText,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Restore',
                  onPressed: () => _runAction(
                    () => state.restoreTrips([trip.id]),
                    'Failed to restore trip.',
                  ),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints.tightFor(
                    width: 30,
                    height: 30,
                  ),
                  icon: const Icon(Icons.restore, size: 18),
                ),
                IconButton(
                  tooltip: 'Delete permanently',
                  onPressed: () => _deleteForever(state, trip),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints.tightFor(
                    width: 30,
                    height: 30,
                  ),
                  icon: const Icon(Icons.delete_forever, color: kDangerRed),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _sectionHeader({required String label, required int count}) {
    return Container(
      color: kGroupHeaderBackground,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13.6,
              fontWeight: FontWeight.w600,
              color: kDarkText,
            ),
          ),
          const SizedBox(width: 8),
          _CountBadge(count: count),
        ],
      ),
    );
  }

  Widget _errorBox(String message, {required Future<void> Function() retry}) {
    return Padding(
      padding: const EdgeInsets.all(15),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13.5, color: kMutedText),
          ),
          const SizedBox(height: 8),
          AppButton(
            small: true,
            label: 'Retry',
            onPressed: () => _runAction(retry, 'Failed to load trips.'),
          ),
        ],
      ),
    );
  }

  // --- Data helpers --------------------------------------------------------

  List<Trip> _filteredTrips(List<Trip> allTrips) {
    var list = allTrips;
    final query = _searchQuery.trim().toLowerCase();
    if (query.isNotEmpty) {
      list = list
          .where((trip) => formatTripName(trip).toLowerCase().contains(query))
          .toList();
    }

    final sorted = List<Trip>.of(list);
    int byDate(Trip a, Trip b) =>
        (a.startedAt ?? '').compareTo(b.startedAt ?? '');

    switch (_sortMode) {
      case SortMode.oldest:
        sorted.sort(byDate);
      case SortMode.nameAsc:
        sorted.sort((a, b) => formatTripName(a).compareTo(formatTripName(b)));
      case SortMode.nameDesc:
        sorted.sort((a, b) => formatTripName(b).compareTo(formatTripName(a)));
      case SortMode.newest:
        sorted.sort((a, b) => byDate(b, a));
    }
    return sorted;
  }

  List<_ListItem> _buildDisplayItems(TripState state, AuthService auth) {
    final items = <_ListItem>[];
    final filtered = _filteredTrips(state.trips.toList());
    final knownClusterIds = state.clusters.map((cluster) => cluster.id).toSet();
    final searching = _searchQuery.trim().isNotEmpty;

    for (final cluster in state.clusters) {
      final members = filtered
          .where((trip) => trip.clusterId == cluster.id)
          .toList();
      if (members.isEmpty && (searching || !auth.isLoggedIn)) continue;

      items.add(_GroupItem(cluster, members));
      if (!_collapsedClusters.contains(cluster.id)) {
        for (final trip in members) {
          items.add(_TripRowItem(trip, groupHidden: cluster.hidden));
        }
      }
    }

    final ungrouped = filtered
        .where(
          (trip) =>
              trip.clusterId == null ||
              !knownClusterIds.contains(trip.clusterId),
        )
        .toList();
    if (ungrouped.isNotEmpty) {
      items.add(_GroupItem(null, ungrouped));
      if (_ungroupedExpanded) {
        for (final trip in ungrouped) {
          items.add(_TripRowItem(trip, groupHidden: false));
        }
      }
    }

    return items;
  }

  // --- Actions -------------------------------------------------------------

  void _cycleSort() {
    final modes = SortMode.values;
    final index = modes.indexOf(_sortMode);
    setState(() => _sortMode = modes[(index + 1) % modes.length]);
  }

  Future<void> _addNewTrip() async {
    final state = context.read<TripState>();
    final defaultName =
        'New Trip ${shortDate(DateTime.now().toIso8601String())}';
    final name = await _promptForText(
      title: 'New trip name:',
      initialValue: defaultName,
      confirmLabel: 'Create',
    );
    if (name == null) return;

    await _runAction(
      () => state.createTrip(name.isEmpty ? defaultName : name),
      'Failed to create trip.',
    );
  }

  Future<void> _addNewCluster() async {
    final state = context.read<TripState>();
    final name = await _promptForText(
      title: 'New group name:',
      initialValue: 'New Group',
      confirmLabel: 'Create',
    );
    if (name == null || name.isEmpty) return;

    await _runAction(() async {
      await state.createCluster(name);
    }, 'Failed to create group.');
  }

  Future<void> _editTrip(TripState state, Trip trip) async {
    final name = await _promptForText(
      title: 'Rename trip:',
      initialValue: formatTripName(trip),
      confirmLabel: 'Save',
    );
    if (name == null || name.isEmpty || name == formatTripName(trip)) return;

    await _runAction(
      () => state.renameTrip(trip.id, name),
      'Failed to rename trip.',
    );
  }

  Future<void> _editCluster(TripState state, TripCluster cluster) async {
    final current = cluster.name ?? '';
    final name = await _promptForText(
      title: 'Rename group:',
      initialValue: current,
      confirmLabel: 'Save',
    );
    if (name == null || name.isEmpty || name == current) return;

    await _runAction(
      () => state.renameCluster(cluster.id, name),
      'Failed to rename group.',
    );
  }

  Future<void> _removeSelected(TripState state) async {
    final ids = state.selectedTripIdsList;
    if (ids.isEmpty) return;
    final confirmed = await _confirm(
      'Move ${ids.length} selected trip(s) to the trash?',
      confirmLabel: 'Move to trash',
    );
    if (!confirmed) return;

    await _runAction(() => state.removeTrips(ids), 'Failed to remove trips.');
  }

  Future<void> _addToGroup(
    TripState state,
    List<int> tripIds, {
    required bool clearAfter,
  }) async {
    if (tripIds.isEmpty) return;
    final choice = await showGroupChooser(
      context,
      clusters: state.clusters.toList(),
    );
    if (choice == null || choice.cancelled) return;
    if (!mounted) return;

    await _runAction(() async {
      if (choice.newGroupName != null) {
        final id = await state.createCluster(choice.newGroupName!);
        await state.assignTripsToCluster(tripIds, id);
      } else {
        await state.assignTripsToCluster(tripIds, choice.clusterId);
      }
      if (clearAfter) state.clearSelection();
    }, 'Failed to assign trips to group.');
  }

  Future<void> _pickLocationTrip(
    TripState state,
    SavedLocation location,
  ) async {
    final choice = await showLocationTripChooser(
      context,
      clusters: state.clusters.toList(),
      trips: state.trips.toList(),
      currentTripId: location.tripId,
      tripLabel: formatTripName,
    );
    if (choice == null || choice.cancelled) return;
    if (!mounted) return;

    await _runAction(
      () => state.setLocationTrip(location.id, choice.tripId),
      'Failed to associate location with trip.',
    );
  }

  Future<void> _deleteForever(TripState state, Trip trip) async {
    final confirmed = await _confirm(
      'Permanently delete "${formatTripName(trip)}"? This cannot be undone.',
      confirmLabel: 'Delete',
    );
    if (!confirmed) return;

    await _runAction(
      () => state.purgeTrips([trip.id]),
      'Failed to delete trip.',
    );
  }

  Future<void> _deleteCluster(TripState state, TripCluster cluster) async {
    final confirmed = await _confirm(
      'Delete group "${cluster.name ?? 'Unnamed group'}"? '
      'Its trips will be ungrouped but not deleted.',
      confirmLabel: 'Delete',
    );
    if (!confirmed) return;

    await _runAction(
      () => state.deleteCluster(cluster.id),
      'Failed to delete group.',
    );
  }

  void _handleTripAction(TripState state, Trip trip, _TripAction action) {
    switch (action) {
      case _TripAction.showOnMap:
        widget.onShowTrips([trip.id]);
      case _TripAction.toggleHidden:
        _runAction(
          () => state.setTripHidden(trip.id, !trip.hidden),
          'Failed to update trip visibility.',
        );
      case _TripAction.addToGroup:
        _addToGroup(state, [trip.id], clearAfter: false);
      case _TripAction.share:
        _shareTrip(trip);
      case _TripAction.edit:
        _editTrip(state, trip);
      case _TripAction.routeGuidance:
        widget.onRouteGuidance(trip.id);
    }
  }

  void _handleClusterAction(
    TripState state,
    TripCluster cluster,
    _GroupItem item,
    _ClusterAction action,
  ) {
    switch (action) {
      case _ClusterAction.showOnMap:
        widget.onShowTrips(item.members.map((trip) => trip.id).toList());
      case _ClusterAction.toggleHidden:
        _runAction(
          () => state.setClusterHidden(cluster.id, !cluster.hidden),
          'Failed to update group visibility.',
        );
      case _ClusterAction.rename:
        _editCluster(state, cluster);
      case _ClusterAction.delete:
        _deleteCluster(state, cluster);
    }
  }

  Future<void> _shareTrip(Trip trip) async {
    final text =
        'Trip: ${formatTripName(trip)}\n'
        '${formatDate(trip.startedAt)} → ${formatDate(trip.endedAt)}\n'
        '${trip.pointCount} GPS points';
    await Clipboard.setData(ClipboardData(text: text));
    _showSnack('Trip details copied to clipboard.');
  }

  Future<void> _exportTrips(TripState state) async {
    final pointsByTrip = <int, List<Map<String, dynamic>>>{};
    for (final point in state.gpsPath) {
      final tripId = point.tripId;
      if (tripId == null) continue;
      pointsByTrip.putIfAbsent(tripId, () => []).add(point.toApiJson());
    }

    final exportData = {
      'exported_at': DateTime.now().toUtc().toIso8601String(),
      'trips': [
        for (final trip in state.trips)
          {
            'id': trip.id,
            'name': trip.name,
            'started_at': trip.startedAt,
            'ended_at': trip.endedAt,
            'hidden': trip.hidden ? 1 : 0,
            'cluster_id': trip.clusterId,
            'points': pointsByTrip[trip.id] ?? const [],
          },
      ],
    };

    await Clipboard.setData(
      ClipboardData(
        text: const JsonEncoder.withIndent('  ').convert(exportData),
      ),
    );
    _showSnack('Trip export copied to clipboard.');
  }

  Future<void> _logout(TripState state) async {
    final auth = context.read<AuthService>();
    await auth.logout();
    await state.loadAll();
    if (!mounted) return;
    _showSnack('Logged out. Showing public data.');
  }

  // --- Dialog helpers ------------------------------------------------------

  Future<String?> _promptForText({
    required String title,
    required String initialValue,
    required String confirmLabel,
  }) async {
    final controller = TextEditingController(text: initialValue);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          onSubmitted: (value) => Navigator.of(dialogContext).pop(value.trim()),
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(controller.text.trim()),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<bool> _confirm(String message, {required String confirmLabel}) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: kDangerRed),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  // --- Small helpers -------------------------------------------------------

  Future<void> _runAction(
    Future<void> Function() action,
    String failureMessage,
  ) async {
    try {
      await action();
    } catch (error) {
      debugPrint('$failureMessage $error');
      _showSnack(failureMessage);
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: const Color(0xFFE9ECEF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$count',
        style: const TextStyle(fontSize: 11, color: Color(0xFF888888)),
      ),
    );
  }
}

class _MenuLabel extends StatelessWidget {
  const _MenuLabel({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: kMutedText),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 13.5)),
      ],
    );
  }
}
