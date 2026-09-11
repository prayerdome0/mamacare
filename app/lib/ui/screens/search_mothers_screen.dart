import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../models/mother.dart';
import '../../services/service_locator.dart';
import '../widgets/shared.dart';
import 'mother_profile_screen.dart';
import 'register_mother_screen.dart';

/// Search mothers by name, ID, or phone.
class SearchMothersScreen extends StatefulWidget {
  const SearchMothersScreen({super.key});

  @override
  State<SearchMothersScreen> createState() => _SearchMothersScreenState();
}

class _SearchMothersScreenState extends State<SearchMothersScreen> {
  final _query = TextEditingController();
  List<Mother> _results = [];
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    _load('');
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load(String term) async {
    final rows = await Services.repo.searchMothers(term);
    if (!mounted) return;
    setState(() {
      _results = rows;
      _searched = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mothers'),
        actions: [
          IconButton(
            tooltip: 'Register mother',
            icon: const Icon(Icons.person_add_alt_1),
            onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const RegisterMotherScreen())),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _query,
              decoration: InputDecoration(
                hintText: 'Search by name, ID or phone…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _query.clear();
                      _load('');
                    }),
              ),
              onChanged: (v) => _load(v),
            ),
          ),
          Expanded(
            child: !_searched
                ? const EmptyState(
                    icon: Icons.groups_outlined,
                    message: 'Start typing to search registered mothers.')
                : _results.isEmpty
                    ? const EmptyState(
                        icon: Icons.search_off,
                        message: 'No mothers match. Use REGISTER MOTHER to add one.')
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _results.length,
                        itemBuilder: (context, i) {
                          final m = _results[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ListTile(
                              onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          MotherProfileScreen(
                                              motherId: m.id))),
                              leading: const CircleAvatar(
                                  child: Icon(Icons.person)),
                              title: Text(m.fullName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              subtitle:
                                  Text('${m.displayCode} • ${m.community ?? '—'}'),
                              trailing: const Icon(Icons.chevron_right,
                                  size: 18, color: AppTheme.muted),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
