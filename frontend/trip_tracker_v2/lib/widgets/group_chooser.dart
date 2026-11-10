import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/trip_cluster.dart';
import 'app_button.dart';

/// Result of the "Add to group" dialog.
class GroupChoice {
  const GroupChoice._({
    this.cancelled = false,
    this.clusterId,
    this.newGroupName,
  });

  const GroupChoice.existing(int clusterId) : this._(clusterId: clusterId);

  const GroupChoice.create(String name) : this._(newGroupName: name);

  const GroupChoice.ungroup() : this._();

  const GroupChoice.cancel() : this._(cancelled: true);

  final bool cancelled;
  final int? clusterId;
  final String? newGroupName;

  bool get isUngroup => !cancelled && clusterId == null && newGroupName == null;
}

/// Port of V1 `components/GroupChooser.svelte`.
Future<GroupChoice?> showGroupChooser(
  BuildContext context, {
  required List<TripCluster> clusters,
}) async {
  final nameController = TextEditingController();

  final result = await showDialog<GroupChoice>(
    context: context,
    builder: (dialogContext) {
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 340,
            maxHeight: MediaQuery.of(dialogContext).size.height * 0.8,
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Add to group',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: kDarkText,
                  ),
                ),
                const SizedBox(height: 10),
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final cluster in clusters) ...[
                          _ChoiceButton(
                            icon: Icons.folder_outlined,
                            label: cluster.name ?? 'Unnamed group',
                            onTap: () =>
                                Navigator.of(dialogContext)
                                    .pop(GroupChoice.existing(cluster.id)),
                          ),
                          const SizedBox(height: 6),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: nameController,
                        decoration: InputDecoration(
                          hintText: 'New group name...',
                          isDense: true,
                          contentPadding: const EdgeInsets.all(8),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    AppButton(
                      small: true,
                      label: 'Create',
                      onPressed: () {
                        final name = nameController.text.trim();
                        Navigator.of(dialogContext).pop(
                          GroupChoice.create(name.isEmpty ? 'New Group' : name),
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _ChoiceButton(
                  icon: Icons.folder_off_outlined,
                  label: 'Ungroup',
                  onTap: () =>
                      Navigator.of(dialogContext)
                          .pop(const GroupChoice.ungroup()),
                ),
                const SizedBox(height: 4),
                _ChoiceButton(
                  label: 'Cancel',
                  transparent: true,
                  centered: true,
                  onTap: () =>
                      Navigator.of(dialogContext)
                          .pop(const GroupChoice.cancel()),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );

  nameController.dispose();
  return result;
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    required this.label,
    required this.onTap,
    this.icon,
    this.transparent = false,
    this.centered = false,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool transparent;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          backgroundColor: transparent ? Colors.transparent : kSearchBackground,
          foregroundColor: centered ? const Color(0xFF555555) : kDarkText,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          alignment: centered ? Alignment.center : Alignment.centerLeft,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
