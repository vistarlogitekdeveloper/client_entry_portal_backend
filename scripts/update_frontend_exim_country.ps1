$files = @{}

$files['..\client_entry_portal_frontend\lib\features\lead\data\lead_repository_impl.dart'] = @"
import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../../../../core/api/api_endpoints.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/api/dio_client.dart';
import '../../../../core/utils/formatter.dart';
import '../domain/entities/lead_entity.dart';
import '../domain/entities/lead_customer_suggestion.dart';
import '../domain/repositories/lead_repository.dart';
import 'datasource/lead_remote_datasource.dart';
import 'models/lead_model.dart';
import 'models/lead_change_model.dart';
import '../../../../core/error/error_handler.dart';

final leadRepositoryProvider = Provider<LeadRepository>((ref) {
  final dio = ref.watch(dioClientProvider).dio;
  final dataSource = LeadRemoteDataSource(dio);
  return LeadRepositoryImpl(dataSource);
});

class LeadRepositoryImpl implements LeadRepository {
  final LeadRemoteDataSource _remoteDataSource;

  LeadRepositoryImpl(this._remoteDataSource);

  @override
  Future<LeadEntity> createLead(LeadEntity lead) async {
    try {
      final model = await _remoteDataSource.createLead({
         'company_name': lead.companyName,
         'contact_person': lead.contactPerson,
         'email': lead.email,
         'mobile': lead.mobile,
         'city': lead.city,
         'region': lead.region,
         'country': lead.country,
         'business_scope': lead.businessScope,
         'status': lead.status,
         'project_location': lead.projectLocation,
         'lead_received_date': lead.leadReceivedDate == null
             ? null
             : AppFormatter.formatDateForApi(lead.leadReceivedDate!),
         'rfq_submission_date': lead.rfqSubmissionDate == null
             ? null
             : AppFormatter.formatDateForApi(lead.rfqSubmissionDate!),
         'lead_by': lead.leadBy,
         'owner': lead.owner,
         'priority': lead.priority,
         'study_status': lead.studyStatus,
         'study_status_reason': lead.studyStatusReason,
         'commercial_status': lead.commercialStatus,
         'commercial_status_reason': lead.commercialStatusReason,
         'projected_value': lead.projectedValue,
         'projected_month': lead.projectedMonth,
         'progress_status': lead.progressStatus,
         'progress_status_reason': lead.progressStatusReason,
         'final_status': lead.finalStatus,
         'final_status_reason': lead.finalStatusReason,
      });
      return model.toEntity();
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<LeadEntity> getLeadDetails(String id) async {
    try {
      final model = await _remoteDataSource.getLeadDetails(id);
      return model.toEntity();
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<List<LeadEntity>> getLeads() async {
    try {
      final models = await _remoteDataSource.getLeads();
      return models.map((m) => m.toEntity()).toList();
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<List<LeadCustomerSuggestion>> getCustomerSuggestions() async {
    try {
      return await _remoteDataSource.getCustomerSuggestions();
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<LeadEntity> updateLead(LeadEntity lead) async {
    try {
      final model = await _remoteDataSource.updateLead(lead.id, {
         'company_name': lead.companyName,
         'contact_person': lead.contactPerson,
         'email': lead.email,
         'mobile': lead.mobile,
         'city': lead.city,
         'region': lead.region,
         'country': lead.country,
         'business_scope': lead.businessScope,
         'status': lead.status,
         'project_location': lead.projectLocation,
         'lead_received_date': lead.leadReceivedDate == null
             ? null
             : AppFormatter.formatDateForApi(lead.leadReceivedDate!),
         'rfq_submission_date': lead.rfqSubmissionDate == null
             ? null
             : AppFormatter.formatDateForApi(lead.rfqSubmissionDate!),
         'lead_by': lead.leadBy,
         'owner': lead.owner,
         'priority': lead.priority,
         'study_status': lead.studyStatus,
         'study_status_reason': lead.studyStatusReason,
         'commercial_status': lead.commercialStatus,
         'commercial_status_reason': lead.commercialStatusReason,
         'projected_value': lead.projectedValue,
         'projected_month': lead.projectedMonth,
         'progress_status': lead.progressStatus,
         'progress_status_reason': lead.progressStatusReason,
         'final_status': lead.finalStatus,
         'final_status_reason': lead.finalStatusReason,
      });
      return model.toEntity();
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<List<LeadChangeEvent>> getLeadChanges(String id) async {
    try {
      return await _remoteDataSource.getLeadChanges(id);
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }

  @override
  Future<Uint8List> exportLeads({Map<String, dynamic>? filters}) async {
    try {
      final response = await _remoteDataSource.dio.get<Uint8List>(
        ApiEndpoints.exportLeads,
        queryParameters: filters,
        options: Options(responseType: ResponseType.bytes),
      );
      return response.data!;
    } catch (e) {
      throw ErrorHandler.handle(e);
    }
  }
}
"@

$files['..\client_entry_portal_frontend\lib\features\lead\data\datasource\lead_remote_datasource.dart'] = @"
import 'package:dio/dio.dart';
import '../../../../core/api/api_endpoints.dart';
import '../models/lead_model.dart';
import '../models/lead_change_model.dart';
import '../../domain/entities/lead_customer_suggestion.dart';

class LeadRemoteDataSource {
  final Dio dio;
  final Map<String, LeadModel> _leadCache = <String, LeadModel>{};

  LeadRemoteDataSource(this.dio);

  LeadModel _parseLead(Map<String, dynamic> e) {
    return LeadModel.fromJson({
      'id': e['id'] ?? '',
      'company_name': e['company_name'] ?? 'Unknown Company',
      'contact_person': e['contact_person'] ?? 'Unknown Contact',
      'email': e['email'] ?? '',
      'mobile': e['mobile'] ?? '',
      'city': e['city'] ?? '',
      'region': e['region'] ?? '',
      'country': e['country'],
      'business_scope': e['business_scope'] ?? '',
      'status': e['status'] ?? 'NEW',
      'created_at': e['created_at'] ?? DateTime.now().toIso8601String(),
      'updated_at': e['updated_at'],
      'project_location': e['project_location'],
      'lead_received_date': e['lead_received_date'],
      'rfq_submission_date': e['rfq_submission_date'],
      'lead_by': e['lead_by'],
      'owner': e['owner'],
      'priority': e['priority'],
      'study_status': e['study_status'],
      'study_status_reason': e['study_status_reason'],
      'commercial_status': e['commercial_status'],
      'commercial_status_reason': e['commercial_status_reason'],
      'projected_value': double.tryParse(e['projected_value']?.toString() ?? ''),
      'projected_month': e['projected_month'],
      'progress_status': e['progress_status'],
      'progress_status_reason': e['progress_status_reason'],
      'final_status': e['final_status'],
      'final_status_reason': e['final_status_reason'],
    });
  }

  Future<List<LeadModel>> getLeads() async {
    final response = await dio.get(ApiEndpoints.leads);
    final data = response.data['data'] as List;
    final leads = data.map((e) => _parseLead(e)).toList();
    _leadCache
      ..clear()
      ..addEntries(leads.map((lead) => MapEntry(lead.id, lead)));
    return leads;
  }

  Future<LeadModel> getLeadDetails(String id) async {
    final cachedLead = _leadCache[id];
    if (cachedLead != null) {
      return cachedLead;
    }

    final listResponse = await dio.get(ApiEndpoints.leads);
    final data = listResponse.data['data'] as List;
    final lead = data.cast<Map<String, dynamic>?>().firstWhere(
          (item) => item != null && item['id']?.toString() == id,
          orElse: () => null,
        );

    if (lead == null) {
      throw DioException(
        requestOptions: listResponse.requestOptions,
        response: Response(
          requestOptions: listResponse.requestOptions,
          statusCode: 404,
          data: {'message': 'Lead not found'},
        ),
        error: 'Lead not found in /leads response',
      );
    }

    final model = _parseLead(lead);
    _leadCache[id] = model;
    return model;
  }

  Future<LeadModel> createLead(Map<String, dynamic> body) async {
    final response = await dio.post(ApiEndpoints.leads, data: body);
    final lead = _parseLead(response.data['data']);
    _leadCache[lead.id] = lead;
    return lead;
  }

  Future<LeadModel> updateLead(String id, Map<String, dynamic> body) async {
    final response = await dio.put('${ApiEndpoints.leads}/$id', data: body);
    final lead = _parseLead(response.data['data']);
    _leadCache[id] = lead;
    return lead;
  }

  Future<List<LeadCustomerSuggestion>> getCustomerSuggestions() async {
    final response = await dio.get('${ApiEndpoints.leads}/customers/names');
    final data = response.data['data'] as List<dynamic>;
    return data
        .map(
          (e) => LeadCustomerSuggestion(
            companyName: (e['company_name'] ?? '').toString(),
            contactPerson: (e['contact_person'] ?? '').toString(),
            email: (e['email'] ?? '').toString(),
            mobile: (e['mobile'] ?? '').toString(),
          ),
        )
        .toList();
  }

  Future<List<LeadChangeModel>> getLeadChanges(String id) async {
    final response = await dio.get('${ApiEndpoints.leads}/$id/changes');
    final data = response.data['data'] as List<dynamic>;
    return data
        .map((e) => LeadChangeModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }
}
"@

foreach ($entry in $files.GetEnumerator()) {
  $path = Resolve-Path $entry.Key
  [System.IO.File]::WriteAllText($path, $entry.Value)
}

$detailsPath = Resolve-Path '..\client_entry_portal_frontend\lib\features\lead\presentation\screens\lead_details_screen.dart'
$details = Get-Content $detailsPath -Raw
[string]$detailsNeedle = @"
                    if (lead.country != null && lead.country!.isNotEmpty)
                      _infoTile('Country', lead.country!),
                    _infoTile('Region', lead.region),
"@
[string]$detailsReplacement = @"
                    _infoTile(
                      lead.country != null && lead.country!.isNotEmpty ? 'Country' : 'Region',
                      lead.country != null && lead.country!.isNotEmpty
                          ? lead.country!
                          : (lead.region.isEmpty ? 'N/A' : lead.region),
                    ),
"@
$details = $details.Replace($detailsNeedle, $detailsReplacement)
$details = $details.Replace(
  "'${lead.city}, ${lead.region}',",
  "'${lead.city}, ${lead.country != null && lead.country!.isNotEmpty ? lead.country : lead.region}',"
)
[System.IO.File]::WriteAllText($detailsPath, $details)

$listPath = Resolve-Path '..\client_entry_portal_frontend\lib\features\lead\presentation\screens\lead_list_screen.dart'
$list = Get-Content $listPath -Raw
$list = $list.Replace(
  "_MetaRow(icon: Icons.location_on_rounded, label: '${lead.city}, ${lead.region}'),",
  "_MetaRow(icon: Icons.location_on_rounded, label: '${lead.city}, ${lead.country != null && lead.country!.isNotEmpty ? lead.country : lead.region}'),"
)
[System.IO.File]::WriteAllText($listPath, $list)

$addLeadPath = Resolve-Path '..\client_entry_portal_frontend\lib\features\lead\presentation\screens\add_lead_screen.dart'
$addLead = Get-Content $addLeadPath -Raw
[string]$onChangedNeedle = @"
                        onChanged: (value) {
                          setState(() {
                            _selectedBusinessScope = value;
                            if (value != _otherBusinessScopeOption) {
                              _otherBusinessScopeController.clear();
                            }
                          });
                        },
"@
[string]$onChangedReplacement = @"
                        onChanged: (value) {
                          setState(() {
                            _selectedBusinessScope = value;
                            if (value != _otherBusinessScopeOption) {
                              _otherBusinessScopeController.clear();
                            }
                            if (_isExim) {
                              _selectedRegion = null;
                            } else {
                              _countryController.clear();
                            }
                          });
                        },
"@
$addLead = $addLead.Replace($onChangedNeedle, $onChangedReplacement)
$addLead = $addLead.Replace(
  "['Submitted', 'Not Submitted', 'Revised Date Submitted', 'Under Preparation']",
  "['Submitted', 'Offer Submitted', 'Not Submitted', 'Revised Date Submitted', 'Under Preparation']"
)
[System.IO.File]::WriteAllText($addLeadPath, $addLead)
