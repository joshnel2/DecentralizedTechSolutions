/**
 * Document AI Insights Component
 * 
 * Shows AI-generated insights for documents and matters.
 * Displays when documents are uploaded from desktop client.
 */

import React, { useState, useEffect } from 'react';
import styles from './DocumentAIInsights.module.css';

interface DocumentInsight {
  id: string;
  name: string;
  summary?: string;
  key_dates?: Array<{ date: string; description: string; type: string }>;
  suggested_tags?: string[];
  document_type?: string;
  importance_score?: number;
  analyzed_at?: string;
}

interface MatterBrief {
  matter: {
    name: string;
    number: string;
    client: string;
    status: string;
    description: string;
  };
  documentCount: number;
  documentSummaries: Array<{
    name: string;
    summary?: string;
    type?: string;
    keyDates?: any[];
  }>;
  upcomingDeadlines: Array<{
    title: string;
    start_time: string;
    type: string;
  }>;
  recentActivity: Array<{
    description: string;
    created_at: string;
    hours: number;
  }>;
}

interface DriveActivity {
  action: string;
  file_name: string;
  file_type: string;
  folder_path: string;
  source: string;
  created_at: string;
  matter_name?: string;
  document_id?: string;
}

interface DocumentAIInsightsProps {
  matterId?: string;
  documentId?: string;
  showActivity?: boolean;
}

export function DocumentAIInsights({ matterId, documentId, showActivity = false }: DocumentAIInsightsProps) {
  const [insights, setInsights] = useState<DocumentInsight[]>([]);
  const [brief, setBrief] = useState<MatterBrief | null>(null);
  const [activity, setActivity] = useState<DriveActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, documentId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (matterId) {
        // Load matter brief and document insights
        const [briefRes, insightsRes] = await Promise.all([
          fetch(`/api/document-ai/matters/${matterId}/brief`, { headers }),
          fetch(`/api/document-ai/matters/${matterId}/document-insights`, { headers }),
        ]);

        if (briefRes.ok) {
          const data = await briefRes.json();
          setBrief(data);
        }

        if (insightsRes.ok) {
          const data = await insightsRes.json();
          setInsights(data.insights || []);
        }
      }

      if (documentId) {
        // Load single document insights
        const res = await fetch(`/api/document-ai/documents/${documentId}/insights`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.insights) {
            setInsights([data.insights]);
          }
        }
      }

      if (showActivity) {
        // Load recent drive activity
        const actRes = await fetch('/api/document-ai/activity/recent?limit=10', { headers });
        if (actRes.ok) {
          const data = await actRes.json();
          setActivity(data.activity || []);
        }
      }
    } catch (err) {
      console.error('Failed to load AI insights:', err);
      setError('Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Loading AI insights...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Matter Brief Section */}
      {brief && (
        <div className={styles.briefSection}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.icon}>📋</span>
            Matter Overview
          </h3>
          <div className={styles.briefCard}>
            <div className={styles.briefHeader}>
              <h4>{brief.matter.name}</h4>
              <span className={`${styles.status} ${styles[brief.matter.status]}`}>
                {brief.matter.status}
              </span>
            </div>
            {brief.matter.client && (
              <p className={styles.client}>Client: {brief.matter.client}</p>
            )}
            {brief.matter.description && (
              <p className={styles.description}>{brief.matter.description}</p>
            )}
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{brief.documentCount}</span>
                <span className={styles.statLabel}>Documents</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{brief.upcomingDeadlines.length}</span>
                <span className={styles.statLabel}>Upcoming Deadlines</span>
              </div>
            </div>
          </div>

          {/* Upcoming Deadlines */}
          {brief.upcomingDeadlines.length > 0 && (
            <div className={styles.deadlinesCard}>
              <h4>
                <span className={styles.icon}>⏰</span>
                Upcoming Deadlines
              </h4>
              <ul className={styles.deadlineList}>
                {brief.upcomingDeadlines.map((deadline, i) => (
                  <li key={i} className={styles.deadlineItem}>
                    <span className={styles.deadlineDate}>
                      {new Date(deadline.start_time).toLocaleDateString()}
                    </span>
                    <span className={styles.deadlineTitle}>{deadline.title}</span>
                    <span className={styles.deadlineType}>{deadline.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Document Insights Section */}
      {insights.length > 0 && (
        <div className={styles.insightsSection}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.icon}>🤖</span>
            AI Document Insights
          </h3>
          <div className={styles.insightsList}>
            {insights.map((doc) => (
              <div key={doc.id} className={styles.insightCard}>
                <div className={styles.insightHeader}>
                  <h4>{doc.name}</h4>
                  {doc.importance_score && (
                    <span className={styles.importance} title="Importance score">
                      {doc.importance_score}/10
                    </span>
                  )}
                </div>
                
                {doc.document_type && (
                  <span className={styles.docType}>{doc.document_type}</span>
                )}
                
                {doc.summary && (
                  <p className={styles.summary}>{doc.summary}</p>
                )}

                {doc.suggested_tags && doc.suggested_tags.length > 0 && (
                  <div className={styles.tags}>
                    {doc.suggested_tags.map((tag, i) => (
                      <span key={i} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                )}

                {doc.key_dates && doc.key_dates.length > 0 && (
                  <div className={styles.keyDates}>
                    <span className={styles.keyDatesLabel}>Key Dates:</span>
                    {doc.key_dates.slice(0, 3).map((kd, i) => (
                      <span key={i} className={styles.keyDate}>
                        {kd.date}: {kd.description}
                      </span>
                    ))}
                  </div>
                )}

                {doc.analyzed_at && (
                  <span className={styles.analyzedAt}>
                    Analyzed {new Date(doc.analyzed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Drive Activity */}
      {showActivity && activity.length > 0 && (
        <div className={styles.activitySection}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.icon}>📁</span>
            Recent Drive Activity
          </h3>
          <div className={styles.activityList}>
            {activity.map((act, i) => (
              <div key={i} className={styles.activityItem}>
                <span className={styles.activityIcon}>
                  {act.action === 'open' && '📖'}
                  {act.action === 'save' && '💾'}
                  {act.action === 'create' && '✨'}
                  {act.action === 'delete' && '🗑️'}
                  {act.action === 'move' && '📦'}
                </span>
                <div className={styles.activityDetails}>
                  <span className={styles.fileName}>{act.file_name}</span>
                  {act.matter_name && (
                    <span className={styles.matterName}>{act.matter_name}</span>
                  )}
                  <span className={styles.activityTime}>
                    {new Date(act.created_at).toLocaleString()}
                  </span>
                </div>
                <span className={styles.activitySource}>{act.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!brief && insights.length === 0 && activity.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🤖</span>
          <p>No AI insights yet</p>
          <span className={styles.emptyHint}>
            Upload documents from the desktop client or web to see AI-generated summaries, tags, and insights.
          </span>
        </div>
      )}
    </div>
  );
}

export default DocumentAIInsights;
